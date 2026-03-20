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
    .upload-area {
      width: 100%;
      max-width: 400px;
      border: 2px dashed #444;
      border-radius: 16px;
      padding: 48px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
    }
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
      max-width: 400px;
      transition: opacity 0.2s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn:hover:not(:disabled) { opacity: 0.9; }
    .status {
      margin-top: 24px;
      padding: 16px;
      border-radius: 12px;
      width: 100%;
      max-width: 400px;
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
  <p class="subtitle">Upload a voice note or audio recording</p>

  <div class="upload-area" id="dropzone">
    <div class="upload-icon">🎤</div>
    <p>Tap to record or choose an audio file</p>
    <input type="file" id="fileInput" accept="audio/*">
  </div>

  <audio class="audio-player" id="audioPlayer" controls style="display:none"></audio>

  <button class="btn" id="submitBtn" disabled>Transcribe Audio</button>

  <div class="status" id="status" style="display:none"></div>

  <script>
    const groupId = ${JSON.stringify(groupId)};
    const userId = ${JSON.stringify(userId)};
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const audioPlayer = document.getElementById('audioPlayer');
    const submitBtn = document.getElementById('submitBtn');
    const status = document.getElementById('status');
    let selectedFile = null;

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      // Check if it's an audio file
      if (!file.type.startsWith('audio/')) {
        alert('Please select an audio file');
        return;
      }

      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        audioPlayer.src = e.target.result;
        audioPlayer.style.display = 'block';
        dropzone.style.display = 'none';
        submitBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }

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
  </script>
</body>
</html>`;
}
