const url = "https://zqxhatthhmjrakfqjngc.supabase.co/storage/v1/render/image/public/divina-assets/global/cat_img_9b305ccd-a6d8-40f0-bfc0-b9d71ee9e581.png?width=600&quality=80&resize=contain&format=origin";

async function testUrl() {
  const res = await fetch(url);
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  const text = await res.text();
  console.log('Response body:', text.substring(0, 200));
}
testUrl();
