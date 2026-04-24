import https from 'https';

https.get('https://drive.google.com/drive/folders/1QQEtM_PL4C89wFomzq_T__JoWEBBqLzs?usp=sharing', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data.substring(0, 1000)));
});
