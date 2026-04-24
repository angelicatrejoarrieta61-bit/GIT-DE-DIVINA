const url = "https://zqxhatthhmjrakfqjngc.supabase.co/storage/v1/object/public/divina-assets/global/cat_img_9b305ccd-a6d8-40f0-bfc0-b9d71ee9e581.png";

async function testUrl() {
  const res = await fetch(url);
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
}
testUrl();
