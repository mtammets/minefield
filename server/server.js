const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serveeri staatilised failid public kaustast
app.use(express.static(path.join(__dirname, '../public')));

// API lõpp-punkt testimiseks
app.get('/api/ping', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Käivita server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
