<script setup>
import { ref, computed } from 'vue'
import axios from 'axios'

const selectedFile = ref(null)
const isProcessing = ref(false)
const error = ref('')
const errorDetails = ref('')
const transcription = ref([])
const speakerCount = ref(0)
const message = ref('')
const fileInput = ref(null)
const selectedLanguage = ref('auto-detect')
const audioPlayer = ref(null)
const audioUrl = ref('')
const isPlaying = ref(false)
const currentTime = ref(0)
const uploadProgress = ref(0)
const processingProgress = ref(0)
const progressMessage = ref('')

const handleFileUpload = (event) => {
  selectedFile.value = event.target.files[0]
  error.value = ''
  errorDetails.value = ''
}

const startTranscription = async () => {
  if (!selectedFile.value) {
    error.value = 'Please select an audio file'
    return
  }

  // Debug logs
  console.log('Environment:', import.meta.env)
  console.log('API URL:', import.meta.env.VITE_API_URL)
  console.log('Full upload URL:', `${import.meta.env.VITE_API_URL}/upload`)

  isProcessing.value = true
  error.value = ''
  errorDetails.value = ''
  transcription.value = []
  speakerCount.value = 0
  message.value = ''
  audioUrl.value = ''
  uploadProgress.value = 0
  processingProgress.value = 0
  progressMessage.value = ''

  const formData = new FormData()
  formData.append('audio', selectedFile.value)
  formData.append('language', selectedLanguage.value)

  try {
    console.log('Making request to:', `${import.meta.env.VITE_API_URL}/upload`)
    const response = await axios.post(`${import.meta.env.VITE_API_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      withCredentials: false,
      onUploadProgress: (progressEvent) => {
        uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        progressMessage.value = `Uploading file... ${uploadProgress.value}%`
      }
    })

    console.log('Response data:', response.data)

    if (response.data.type === 'error') {
      error.value = response.data.error
      errorDetails.value = response.data.details
    } else {
      if (response.data.transcription && response.data.transcription.length > 0) {
        const firstSegment = response.data.transcription[0]
        if (firstSegment.text === 'No speech was detected in the audio file.') {
          message.value = 'No speech detected in the audio file'
        } else {
          transcription.value = response.data.transcription
          speakerCount.value = response.data.speakerCount || 0
          message.value = response.data.message || 'Transcription completed'
          
          const audioFileName = response.data.audioFile.split('/').pop()
          audioUrl.value = `${import.meta.env.VITE_API_URL}/audio/${audioFileName}`
        }
      } else {
        message.value = 'No speech detected in the audio file'
      }
    }
  } catch (err) {
    console.error('Full error object:', err)
    console.error('Error config:', err.config)
    console.error('Error request:', err.request)
    console.error('Error response:', err.response)
    error.value = 'Failed to process audio file. Please try again.'
    errorDetails.value = err.response?.data?.details || err.message
    console.error('Error:', err)
  } finally {
    isProcessing.value = false
    selectedFile.value = null
    fileInput.value.value = ''
  }
}

const togglePlayback = () => {
  if (audioPlayer.value) {
    if (isPlaying.value) {
      audioPlayer.value.pause()
    } else {
      audioPlayer.value.play()
    }
    isPlaying.value = !isPlaying.value
  }
}

const updateCurrentTime = () => {
  if (audioPlayer.value) {
    currentTime.value = Math.floor(audioPlayer.value.currentTime * 1000)
  }
}

const isWordActive = (segment, word) => {
  const wordStart = Math.floor(word.offset / 10000)
  const wordEnd = wordStart + Math.floor(word.duration / 10000)
  
  const buffer = 50
  return currentTime.value >= (wordStart - buffer) && currentTime.value <= (wordEnd + buffer)
}

const seekToWord = (segment, word) => {
  if (audioPlayer.value) {
    const wordStart = word.offset / 10000000
    audioPlayer.value.currentTime = wordStart
    if (!isPlaying.value) {
      audioPlayer.value.play()
      isPlaying.value = true
    }
  }
}

const formatTime = (nanoseconds) => {
  const seconds = Math.floor(nanoseconds / 10000000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="container">
    <h1>Audio Transcription with Speaker Diarization</h1>
    
    <div class="upload-section">
      <div class="language-select">
        <label for="language">Select Language:</label>
        <select id="language" v-model="selectedLanguage">
          <option value="auto-detect">Auto Detect</option>
          <option value="de-DE">German</option>
          <option value="fr-FR">French</option>
          <option value="en-US">English (US)</option>
          <option value="it-IT">Italian</option>
        </select>
      </div>

      <input 
        type="file" 
        @change="handleFileUpload" 
        accept="audio/*"
        ref="fileInput"
        class="file-input"
      >
      <button @click="startTranscription" :disabled="!selectedFile || isProcessing">
        {{ isProcessing ? 'Processing...' : 'Start Transcription' }}
      </button>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
      <div v-if="errorDetails" class="error-details">{{ errorDetails }}</div>
    </div>

    <div v-if="isProcessing" class="progress-section">
      <div class="progress-container">
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: `${Math.max(uploadProgress, processingProgress)}%` }"
          ></div>
        </div>
        <div class="progress-message">{{ progressMessage }}</div>
      </div>
      <div v-if="uploadProgress === 100 && processingProgress < 100" class="processing-status">
        <div class="loading-spinner"></div>
        <div class="status">Processing audio file...</div>
      </div>
    </div>

    <div v-if="transcription.length > 0 || message" class="transcription-section">
      <h2>Transcription Results</h2>
      <div class="audio-controls" v-if="audioUrl">
        <audio 
          ref="audioPlayer" 
          :src="audioUrl" 
          controls 
          @timeupdate="updateCurrentTime"
          @play="isPlaying = true"
          @pause="isPlaying = false"
        ></audio>
        <button @click="togglePlayback" class="playback-button">
          {{ isPlaying ? 'Pause' : 'Play' }}
        </button>
      </div>
      <div class="summary" v-if="message">
        {{ message }}
      </div>
      <div v-for="(segment, index) in transcription" :key="index" class="transcription-segment">
        <div class="speaker">{{ segment.speaker || 'Speaker 1' }}</div>
        <div class="timestamp">
          {{ formatTime(segment.startTime) }} - {{ formatTime(segment.endTime) }}
        </div>
        <div class="text">
          <span 
            v-for="(word, wordIndex) in segment.words" 
            :key="wordIndex"
            :class="{ 'highlight': isWordActive(segment, word) }"
            @click="seekToWord(segment, word)"
            class="word"
          >
            {{ word.text }}
          </span>
        </div>
        <div class="details">
          <span v-if="segment.language" class="language">Language: {{ segment.language }}</span>
          <span class="confidence">
            Confidence: {{ segment.confidence ? (segment.confidence * 100).toFixed(1) : 'N/A' }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.upload-section {
  margin: 2rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.language-select {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.language-select select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  min-width: 200px;
}

.file-input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  padding: 0.5rem 1rem;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error-message {
  color: red;
  margin: 1rem 0;
}

.error-details {
  font-size: 0.9rem;
  margin-top: 0.5rem;
  color: #666;
}

.transcription-section {
  margin-top: 2rem;
}

.audio-controls {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.playback-button {
  background-color: #2196F3;
}

.summary {
  margin-bottom: 1rem;
  font-weight: bold;
  color: #4CAF50;
}

.transcription-segment {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 4px;
}

.speaker {
  font-weight: bold;
  color: #4CAF50;
  margin-bottom: 0.5rem;
}

.timestamp {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.text {
  line-height: 1.5;
  margin-bottom: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.word {
  margin-right: 0.25rem;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 2px 4px;
  border-radius: 3px;
  display: inline-block;
}

.word.highlight {
  background-color: #FFEB3B;
  color: #000;
  font-weight: bold;
  transform: scale(1.05);
}

.details {
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  color: #666;
}

.language, .confidence {
  font-style: italic;
}

.progress-section {
  margin: 1rem 0;
}

.progress-container {
  background-color: #f5f5f5;
  border-radius: 4px;
  padding: 1rem;
}

.progress-bar {
  height: 20px;
  background-color: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background-color: #4CAF50;
  transition: width 0.3s ease;
}

.progress-message {
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}

.processing-status {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.5rem;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status {
  font-size: 0.9rem;
  color: #666;
}
</style>

