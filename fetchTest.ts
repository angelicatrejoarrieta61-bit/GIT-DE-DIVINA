import fetch from 'node-fetch';
async function run() {
  const res = await fetch("https://zqxhatthhmjrakfqjngc.supabase.co/storage/v1/object/public/divina-assets/products/a-g-e-reverse-night-50ml-1.jpg");
  console.log(res.status);
}
run();
