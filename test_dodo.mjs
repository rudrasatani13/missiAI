import DodoPayments from 'dodopayments';

const client = new DodoPayments({
  bearerToken: 'G7PdrBJBm45MlI-H.vfqyKEZ6K9t9GDL5BZj3b14lr2mrv8MjyPayj3I3N1W34-ZN',
  environment: 'test_mode',
});

try {
  const result = await client.checkoutSessions.create({
    product_cart: [{ product_id: 'pdt_0Nbu7u8s6VugpHDA9EjZ8', quantity: 1 }],
  });
  console.log('SUCCESS:', JSON.stringify(result, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
  console.error('STATUS:', e.status);
  if (e.error) console.error('BODY:', JSON.stringify(e.error, null, 2));
  if (e.headers) {
    for (const [k,v] of e.headers.entries()) console.error(`  ${k}: ${v}`);
  }
}
