// Teste manual da API de briefing process
const testRequest = {
  projectUrls: [
    "https://test.url1",
    "https://test.url2"
  ],
  options: {
    headless: true,
    continueOnError: true
  }
};

fetch('http://localhost:3000/api/briefing/process', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testRequest),
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));