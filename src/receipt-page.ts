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
    .upload-area:hover, .upload-area.dragover { border-color: #4CAF50; }
    .upload-area p { color: #aaa; margin-top: 12px; font-size: 14px; }
    .upload-icon { font-size: 48px; }
    input[type="file"] { display: none; }
    .preview { max-width: 100%; max-height: 300px; border-radius: 12px; margin-top: 16px; }
    .btn {
      background: #4CAF50;
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
      border-top-color: #4CAF50;
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
  <p class="subtitle">${description ? description : "Upload a receipt to split with your group"}</p>

  <div class="upload-area" id="dropzone">
    <div class="upload-icon">&#128247;</div>
    <p>Tap to take a photo or choose a file</p>
    <input type="file" id="fileInput" accept="image/*" capture="environment">
  </div>

  <img class="preview" id="preview" style="display:none">

  <button class="btn" id="submitBtn" disabled>Split This Receipt</button>

  <div class="status" id="status" style="display:none"></div>

  <script>
    const groupId = ${JSON.stringify(groupId)};
    const paidBy = ${JSON.stringify(paidBy)};
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('preview');
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
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = 'block';
        dropzone.style.display = 'none';
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
          status.textContent = 'Receipt parsed and sent to your group chat! You can close this page.';
        } else {
          throw new Error(data.error || 'Failed to parse receipt');
        }
      } catch (err) {
        status.className = 'status error';
        status.textContent = 'Error: ' + err.message + ' - try again?';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Split This Receipt';
      }
    });
  </script>
</body>
</html>`;
}
