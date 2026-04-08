import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

const URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=" + apiKey;

const ws = new WebSocket(URL);

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    setup: {
      model: `models/gemini-2.0-flash-exp`,
    }
  }));

  setTimeout(() => {
    ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: Buffer.from(new Uint8Array(100)).toString("base64")
        }
      }
    }));
  }, 1000);
};

ws.onmessage = async (event) => {
  let text = event.data;
  if (text instanceof Blob) {
    text = await text.text();
  }
  console.log('Message:', JSON.stringify(JSON.parse(text), null, 2));
};

ws.onerror = (err) => {
  console.log('Error:', err);
};

ws.onclose = (event) => {
  console.log('Close:', event.code, event.reason);
  process.exit();
};
