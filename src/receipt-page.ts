export function receiptUploadHTML(groupId: string, paidBy: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Worries - Upload Receipt</title>
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
    .subtitle { color: #888; margin-bottom: 24px; font-size: 14px; }
    .upload-area {
      width: 100%;
      max-width: 400px;
      border: 2px dashed #444;
      border-radius: 16px;
      padding: 40px 24px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .upload-area:hover, .upload-area.dragover { border-color: #4CAF50; }
    .upload-area p { color: #aaa; margin-top: 8px; font-size: 14px; }
    .upload-icon { font-size: 48px; }
    input[type="file"] { display: none; }
    .btn-row {
      display: flex;
      gap: 12px;
      width: 100%;
      max-width: 400px;
      margin-top: 16px;
    }
    .btn-option {
      flex: 1;
      background: #1a1a2e;
      color: #fff;
      border: 1px solid #333;
      padding: 14px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: border-color 0.2s, background 0.2s;
    }
    .btn-option:hover { border-color: #4CAF50; background: #1a2e1a; }
    .btn-option .icon { font-size: 24px; display: block; margin-bottom: 4px; }
    .preview-container {
      position: relative;
      width: 100%;
      max-width: 400px;
      margin-top: 16px;
    }
    .preview { max-width: 100%; max-height: 300px; border-radius: 12px; display: block; margin: 0 auto; }
    .change-btn {
      display: block;
      margin: 8px auto 0;
      background: none;
      border: none;
      color: #888;
      font-size: 13px;
      cursor: pointer;
      text-decoration: underline;
    }
    .btn {
      background: #4CAF50;
      color: #fff;
      border: none;
      padding: 14px 32px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 16px;
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
      border-top-color: #4CAF50;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .paste-hint { color: #666; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>📸 No Worries</h1>
  <p class="subtitle">${description ? description : "Upload a receipt to split with your group"}</p>

  <div id="uploadSection">
    <div class="upload-area" id="dropzone">
      <div class="upload-icon">🧾</div>
      <p>Drag & drop a receipt here</p>
    </div>

    <div class="btn-row">
      <button class="btn-option" id="cameraBtn">
        <span class="icon">📷</span>
        Take Photo
      </button>
      <button class="btn-option" id="galleryBtn">
        <span class="icon">🖼️</span>
        Choose Photo
      </button>
    </div>

    <p class="paste-hint">or paste an image from clipboard (Ctrl+V / Cmd+V)</p>
  </div>

  <!-- Hidden file inputs: one for camera, one for gallery -->
  <input type="file" id="cameraInput" accept="image/*" capture="environment">
  <input type="file" id="galleryInput" accept="image/*">

  <div class="preview-container" id="previewContainer" style="display:none">
    <img class="preview" id="preview">
    <button class="change-btn" id="changeBtn">change photo</button>
  </div>

  <button class="btn" id="submitBtn" disabled>Split This Receipt ✨</button>

  <div class="status" id="status" style="display:none"></div>

  <script>
    const groupId = ${JSON.stringify(groupId)};
    const paidBy = ${JSON.stringify(paidBy)};
    const dropzone = document.getElementById('dropzone');
    const cameraInput = document.getElementById('cameraInput');
    const galleryInput = document.getElementById('galleryInput');
    const cameraBtn = document.getElementById('cameraBtn');
    const galleryBtn = document.getElementById('galleryBtn');
    const preview = document.getElementById('preview');
    const previewContainer = document.getElementById('previewContainer');
    const uploadSection = document.getElementById('uploadSection');
    const submitBtn = document.getElementById('submitBtn');
    const changeBtn = document.getElementById('changeBtn');
    const status = document.getElementById('status');
    let selectedFile = null;

    // Camera button
    cameraBtn.addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', () => {
      if (cameraInput.files.length) handleFile(cameraInput.files[0]);
    });

    // Gallery button
    galleryBtn.addEventListener('click', () => galleryInput.click());
    galleryInput.addEventListener('change', () => {
      if (galleryInput.files.length) handleFile(galleryInput.files[0]);
    });

    // Drag and drop
    dropzone.addEventListener('click', () => galleryInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // Paste from clipboard
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    });

    // Change photo button
    changeBtn.addEventListener('click', () => {
      selectedFile = null;
      previewContainer.style.display = 'none';
      uploadSection.style.display = 'block';
      submitBtn.disabled = true;
      status.style.display = 'none';
    });

    function handleFile(file) {
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        previewContainer.style.display = 'block';
        uploadSection.style.display = 'none';
        submitBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }

    submitBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
      status.style.display = 'block';
      status.className = 'status loading';
      status.innerHTML = '<span class="spinner"></span> Scanning receipt with AI...';

      try {
        const formData = new FormData();
        formData.append('receipt', selectedFile);
        formData.append('groupId', groupId);
        if (paidBy) formData.append('paidBy', paidBy);

        const res = await fetch('/receipt/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
          status.className = 'status success';
          status.textContent = '✅ Receipt parsed and sent to your group chat! You can close this page.';
        } else {
          throw new Error(data.error || 'Failed to parse receipt');
        }
      } catch (err) {
        status.className = 'status error';
        status.textContent = '❌ ' + err.message + ' — try again?';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Split This Receipt ✨';
      }
    });
  </script>
</body>
</html>`;
}
