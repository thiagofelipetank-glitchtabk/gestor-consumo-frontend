const express = require('express');
const path = require('path');
const app = express();

// Servir todos os arquivos estáticos (HTML, CSS, JS, imagens, etc.)
app.use(express.static(__dirname));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 57817;
app.listen(PORT, () => {
  console.log(`✅ Frontend rodando em http://localhost:${PORT}`);
});
