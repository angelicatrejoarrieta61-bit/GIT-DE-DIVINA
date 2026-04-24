import fetch from 'node-fetch';
async function run() {
  const res = await fetch("https://zqxhatthhmjrakfqjngc.supabase.co/storage/v1/object/public/divina-assets/global/logo_url.png");
  console.log('STATUS:', res.status);
}
run();
