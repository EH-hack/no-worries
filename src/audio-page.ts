export function audioUploadHTML(groupId: string, userId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Worries - Voice Note</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #888; margin-bottom: 32px; font-size: 14px; }
    .container {
      width: 100%;
      max-width: 400px;
    }
    .action-buttons {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }
    .action-btn {
      flex: 1;
      background: #1a1a2e;
      color: #fff;
      border: 2px solid #444;
      padding: 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }
    .action-btn:hover { border-color: #9C27B0; }
    .action-btn.active { background: #9C27B0; border-color: #9C27B0; }
    .record-area {
      width: 100%;
      border: 2px dashed #444;
      border-radius: 16px;
      padding: 48px 24px;
      text-align: center;
      display: none;
    }
    .record-area.active { display: block; }
    .record-btn {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #9C27B0;
      border: 4px solid #fff;
      cursor: pointer;
      transition: all 0.3s;
      margin: 0 auto;
    }
    .record-btn:hover { transform: scale(1.1); }
    .record-btn.recording {
      background: #f44336;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7); }
      50% { box-shadow: 0 0 0 20px rgba(244, 67, 54, 0); }
    }
    .record-time {
      margin-top: 16px;
      font-size: 24px;
      font-weight: 600;
      font-family: 'Courier New', monospace;
    }
    .upload-area {
      width: 100%;
      border: 2px dashed #444;
      border-radius: 16px;
      padding: 48px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
      display: none;
    }
    .upload-area.active { display: block; }
    .upload-area:hover, .upload-area.dragover { border-color: #9C27B0; }
    .upload-area p { color: #aaa; margin-top: 12px; font-size: 14px; }
    .upload-icon { font-size: 48px; }
    input[type="file"] { display: none; }
    .audio-player {
      max-width: 100%;
      margin-top: 16px;
      width: 100%;
    }
    .btn {
      background: #9C27B0;
      color: #fff;
      border: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 24px;
      width: 100%;
      transition: opacity 0.2s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn:hover:not(:disabled) { opacity: 0.9; }
    .btn.secondary {
      background: #444;
      margin-top: 12px;
    }
    .status {
      margin-top: 24px;
      padding: 16px;
      border-radius: 12px;
      width: 100%;
      text-align: center;
      font-size: 14px;
    }
    .status.loading { background: #1a1a2e; color: #aaa; }
    .status.success { background: #1a2e1a; color: #4CAF50; }
    .status.error { background: #2e1a1a; color: #f44336; }
    .spinner {
      display: inline-block;
      width: 20px; height: 20px;
      border: 2px solid #444;
      border-top-color: #9C27B0;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <h1>No Worries</h1>
  <p class="subtitle">Record or upload a voice note</p>

  <div class="container">
    <div class="action-buttons">
      <button class="action-btn active" id="recordModeBtn">🎤 Record</button>
      <button class="action-btn" id="uploadModeBtn">📁 Upload File</button>
    </div>

    <div class="record-area active" id="recordArea">
      <div class="record-btn" id="recordBtn"></div>
      <p class="record-time" id="recordTime">00:00</p>
      <p style="color: #888; margin-top: 12px; font-size: 14px;">Tap to start recording</p>
    </div>

    <div class="upload-area" id="uploadArea">
      <div class="upload-icon">📁</div>
      <p>Drag & drop or tap to choose an audio file</p>
      <input type="file" id="fileInput" accept="audio/*">
    </div>

    <audio class="audio-player" id="audioPlayer" controls style="display:none"></audio>

    <button class="btn" id="submitBtn" style="display:none">Transcribe Audio</button>
    <button class="btn secondary" id="resetBtn" style="display:none">Start Over</button>

    <div class="status" id="status" style="display:none"></div>
  </div>

  <script>
    const groupId = ${JSON.stringify(groupId)};
    const userId = ${JSON.stringify(userId)};

    // DOM elements
    const recordModeBtn = document.getElementById('recordModeBtn');
    const uploadModeBtn = document.getElementById('uploadModeBtn');
    const recordArea = document.getElementById('recordArea');
    const uploadArea = document.getElementById('uploadArea');
    const recordBtn = document.getElementById('recordBtn');
    const recordTime = document.getElementById('recordTime');
    const fileInput = document.getElementById('fileInput');
    const audioPlayer = document.getElementById('audioPlayer');
    const submitBtn = document.getElementById('submitBtn');
    const resetBtn = document.getElementById('resetBtn');
    const status = document.getElementById('status');

    // State
    let currentMode = 'record';
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingStart = null;
    let timerInterval = null;
    let selectedFile = null;

    // Mode switching
    recordModeBtn.addEventListener('click', () => switchMode('record'));
    uploadModeBtn.addEventListener('click', () => switchMode('upload'));

    function switchMode(mode) {
      currentMode = mode;
      if (mode === 'record') {
        recordModeBtn.classList.add('active');
        uploadModeBtn.classList.remove('active');
        recordArea.classList.add('active');
        uploadArea.classList.remove('active');
      } else {
        uploadModeBtn.classList.add('active');
        recordModeBtn.classList.remove('active');
        uploadArea.classList.add('active');
        recordArea.classList.remove('active');
      }
      reset();
    }

    // Recording
    recordBtn.addEventListener('click', async () => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        await startRecording();
      } else {
        stopRecording();
      }
    });

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          audioPlayer.src = audioUrl;
          audioPlayer.style.display = 'block';
          submitBtn.style.display = 'block';
          resetBtn.style.display = 'block';
          selectedFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        recordBtn.classList.add('recording');
        recordingStart = Date.now();
        timerInterval = setInterval(updateTimer, 100);
      } catch (err) {
        alert('Microphone access denied. Please enable microphone permissions and try again.');
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.classList.remove('recording');
        clearInterval(timerInterval);
      }
    }

    function updateTimer() {
      const elapsed = Date.now() - recordingStart;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      recordTime.textContent = \`\${String(minutes).padStart(2, '0')}:\${String(secs).padStart(2, '0')}\`;
    }

    // File upload
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      if (!file.type.startsWith('audio/')) {
        alert('Please select an audio file');
        return;
      }

      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        audioPlayer.src = e.target.result;
        audioPlayer.style.display = 'block';
        uploadArea.style.display = 'none';
        submitBtn.style.display = 'block';
        resetBtn.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    // Submit
    submitBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Transcribing...';
      status.style.display = 'block';
      status.className = 'status loading';
      status.innerHTML = '<span class="spinner"></span> Transcribing audio with AI...';

      try {
        const formData = new FormData();
        formData.append('audio', selectedFile);
        formData.append('groupId', groupId);
        formData.append('userId', userId);

        const res = await fetch('/audio/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
          status.className = 'status success';
          status.innerHTML = \`✅ Transcribed!<br><br><strong>"\${data.transcription}"</strong><br><br>Sent to your group chat. You can close this page.\`;
          submitBtn.style.display = 'none';
          resetBtn.style.display = 'none';
        } else {
          throw new Error(data.error || 'Failed to transcribe audio');
        }
      } catch (err) {
        status.className = 'status error';
        status.textContent = 'Error: ' + err.message + ' - try again?';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Transcribe Audio';
      }
    });

    // Reset
    resetBtn.addEventListener('click', reset);

    function reset() {
      selectedFile = null;
      audioPlayer.style.display = 'none';
      audioPlayer.src = '';
      submitBtn.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Transcribe Audio';
      resetBtn.style.display = 'none';
      status.style.display = 'none';
      recordTime.textContent = '00:00';
      fileInput.value = '';

      if (currentMode === 'upload') {
        uploadArea.style.display = 'block';
      }

      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      }
    }
  </script>
</body>
</html>`;
}
