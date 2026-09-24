const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const OS_API_KEY = process.env.OPENSUBTITLES_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    }

    // 1. Fetch English subtitles from OpenSubtitles
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

    // 2. Send to Gemini for Hindi translation
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const aiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: 'You are a professional subtitle translator. Translate all dialogue text from English to Hindi in natural Devanagari script. Strictly preserve all original subtitle formatting, line numbers, and timestamp structures (00:00:00,000 --> 00:00:00,000). Do NOT add markdown code block wrappers (such as ``` or ```srt), conversational intros, or explanations.'
            }
          ]
        },
        contents: [
          {
            parts: [
              { text: englishSubs }
            ]
          }
        ]
      })
    });

    const aiData = await aiResponse.json();

    if (aiData.error) {
      console.error('Gemini API Error:', aiData.error);
      return res.status(500).json({ error: aiData.error.message || 'Gemini error' });
    }

    let hindiSubs = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!hindiSubs) {
      return res.status(500).json({ error: 'Failed to generate Hindi subtitles' });
    }

    // Strip markdown code fences if the model wraps the output in ```srt ... ```
    hindiSubs = hindiSubs.replace(/^```(?:srt)?\r?\n/i, '').replace(/\r?\n```$/i, '').trim();

    // 3. Return the Hindi subtitles to the player
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(hindiSubs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
