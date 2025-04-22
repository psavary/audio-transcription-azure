require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get language from request body or use auto-detection
        const language = req.body.language || 'auto-detect';

        // Create speech config with the selected language
        const speechConfig = sdk.SpeechConfig.fromSubscription(
            process.env.AZURE_SPEECH_KEY,
            process.env.AZURE_SPEECH_REGION
        );

        // Set language if not auto-detect
        if (language !== 'auto-detect') {
            speechConfig.speechRecognitionLanguage = language;
            console.log('Using specific language:', language);
        } else {
            // Enable auto-detection with a focused set of 4 languages
            speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguages, "de-CH,fr-FR,en-US,it-CH");
            
            // Enable continuous language detection
            speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
            
            // Enable detailed language detection logging
            speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EnableAudioLogging, "false");
            
            console.log('Using auto-detection for languages: de-CH,fr-CH,en-US,it-CH');
        }

        // Configure diarization settings
        speechConfig.requestWordLevelTimestamps();
        
        // Additional diarization settings
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000");
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "500");
        
        // Enhanced segmentation settings
        speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1000");
        speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationStrategy, "Semantic");
        
        // Request detailed results
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestDetailedResultTrueFalse, "true");
        
        // Request word boundaries for better segmentation
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestWordBoundary, "true");
        speechConfig.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestPunctuationBoundary, "true");
        
        console.log('Speech config created with language:', language);
        console.log('Processing file:', req.file.path);

        // Determine if input is WAV: skip FFmpeg and use direct file input for WAV
        let audioConfig;
        if (path.extname(req.file.path).toLowerCase() === '.wav') {
            console.log('Using direct WAV input for transcription');
            audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(req.file.path));
        } else {
            console.log('Transcoding and filtering audio with FFmpeg');
            const pushStream = sdk.AudioInputStream.createPushStream();
            const ffmpeg = spawn('ffmpeg', [
                '-i', req.file.path,
                '-af', 'highpass=f=200,lowpass=f=3000',
                '-f', 'wav',
                '-acodec', 'pcm_s16le',
                '-ac', '1',
                '-ar', '16000',
                'pipe:1'
            ]);
            ffmpeg.stderr.on('data', data => console.error('FFmpeg stderr:', data.toString()));
            ffmpeg.on('error', err => console.error('Failed to start FFmpeg:', err));
            ffmpeg.stdout.on('data', chunk => pushStream.write(chunk));
            ffmpeg.on('close', code => {
                console.log(`FFmpeg exited with code ${code}`);
                pushStream.close();
            });
            audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        }

        // Create conversation transcriber with the chosen audio config
        const transcriber = new sdk.ConversationTranscriber(speechConfig, audioConfig);

        let transcription = [];
        let speakerMap = new Map();
        let speakerCount = 0;
        let hasSpeechDetected = false;
        let currentSegment = null;

        // Create a promise to handle the transcription completion
        const transcriptionPromise = new Promise((resolve, reject) => {
            transcriber.transcribed = (s, e) => {
                if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                    console.log('Speech recognized, parsing result...');
                    
                    // Get the speaker ID directly from the result
                    const speakerId = e.result.speakerId || 'Unknown';
                    console.log('Speaker ID:', speakerId);
                    
                    // Map speaker IDs to sequential numbers starting from 1
                    if (!speakerMap.has(speakerId)) {
                        speakerMap.set(speakerId, `Speaker ${speakerMap.size + 1}`);
                        speakerCount = speakerMap.size;
                    }
                    
                    // Parse the JSON to get word-level information
                    let rawResult;
                    try {
                        rawResult = JSON.parse(e.result.privJson);
                        console.log('Raw result parsed successfully');
                    } catch (parseError) {
                        console.error('Failed to parse privJson:', parseError);
                        return;
                    }

                    if (!rawResult || !rawResult.NBest || !rawResult.NBest[0]) {
                        console.error('Invalid result format:', rawResult);
                        return;
                    }

                    const nBest = rawResult.NBest[0];
                    
                    // Create a new segment for each transcribed result
                    currentSegment = {
                        speaker: speakerMap.get(speakerId),
                        text: nBest.Display,
                        language: rawResult.PrimaryLanguage?.Language || 'unknown',
                        languageConfidence: rawResult.PrimaryLanguage?.Confidence || 'unknown',
                        confidence: nBest.Confidence || 1.0,
                        words: [],
                        startTime: e.result.offset,
                        endTime: e.result.offset + e.result.duration
                    };
                    
                    // Process words
                    if (nBest.Words) {
                        console.log('Processing words...');
                        for (const word of nBest.Words) {
                            currentSegment.words.push({
                                text: word.Word,
                                offset: word.Offset,
                                duration: word.Duration
                            });
                        }
                    }
                    
                    transcription.push(currentSegment);
                    hasSpeechDetected = true;

                    // Log the speaker and their text with language information
                    console.log(`\n=== Speaker ${speakerMap.get(speakerId)} ===`);
                    console.log('Text:', nBest.Display);
                    console.log('Detected Language:', rawResult.PrimaryLanguage?.Language || 'unknown');
                    console.log('Language Confidence:', rawResult.PrimaryLanguage?.Confidence || 'unknown');
                    console.log('Transcription Confidence:', nBest.Confidence || 1.0);
                    console.log('Time:', `${formatTime(e.result.offset)} - ${formatTime(e.result.offset + e.result.duration)}`);
                    console.log('Words:', nBest.Words?.map(w => w.Word).join(' ') || 'No words');
                    console.log('===================\n');
                }
            };

            transcriber.canceled = (s, e) => {
                if (e.reason === sdk.CancellationReason.Error) {
                    console.error('Transcription error:', e.errorDetails);
                    reject(new Error(e.errorDetails));
                }
            };

            transcriber.sessionStopped = (s, e) => {
                console.log('Transcription session stopped');
                if (transcription.length === 0) {
                    transcription = [{
                        speaker: 'No speech detected',
                        text: 'No speech was detected in the audio file.',
                        words: [],
                        startTime: 0,
                        endTime: 0
                    }];
                    speakerCount = 0;
                }
                resolve({
                    type: 'result',
                    transcription,
                    speakerCount,
                    message: hasSpeechDetected 
                        ? (speakerCount > 0 ? `Detected ${speakerCount} speakers` : 'Transcription completed (speaker detection not available)')
                        : 'No speech detected in the audio file',
                    audioFile: req.file.path
                });
            };
        });

        try {
            console.log('Starting transcription...');
            await transcriber.startTranscribingAsync();
            console.log('Transcription started, waiting for completion...');
            
            const result = await transcriptionPromise;
            console.log('Transcription completed, sending response...');
            res.json(result);
            
            await transcriber.stopTranscribingAsync();
        } catch (error) {
            console.error('Transcription error:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({ 
                type: 'error',
                error: 'Transcription failed',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    } catch (error) {
        console.error('Error processing audio:', error);
        res.status(500).json({ 
            error: 'Failed to process audio',
            details: error.message
        });
    }
});

// Serve audio files
app.get('/audio/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.sendFile(filePath);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 