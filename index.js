const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const OS_API_KEY = process.env.OPENSUBTITLES_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => {
  res.send('✅ Stremio Subtitle Translator is running');
});

// manifest.json route
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/subtitles/:imdbId', async (req, res) => {
  try {
    const imdbId = req.params.imdbId;

    // 1. קבלת כתוביות מאופן סאב
    const subsResponse = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?imdb_id=${imdbId}&languages=en`, {
      headers: {
        'Api-Key': OS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    const subsData = await subsResponse.json();
    if (!subsData.data || subsData.data.length === 0) {
      return res.status(404).json({ error: 'No English subtitles found' });
    }

    const fileUrl = subsData.data[0].attributes.url;
    const fileRes = await fetch(fileUrl);
    const englishSubs = await fileRes.text();

    // 2. שליחה ל־ChatGPT לתרגום
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a subtitle translator. Translate all text from English to Hebrew while keeping subtitle format unchanged.' },
          { role: 'user', content: englishSubs }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const hebrewSubs = aiData.choices[0].message.content;

    // 3. החזרת הכתוביות ל־Stremio
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(hebrewSubs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
