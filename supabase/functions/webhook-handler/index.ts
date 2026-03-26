/* import { serve } from 'std/http/server.ts';
import { https://corsproxy.io/?Headers } from '../_shared/https://corsproxy.io/?.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: https://corsproxy.io/?Headers });

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) throw new Error('Missing stripe signature');

    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

    // Verify event came from Stripe
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );
    const supabase = createAdminClient();

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      await supabase
        .from('workspaces')
        .update({
          tier: 'pro', // Map to logic based on price ID
          stripe_subscription_id: subscription.id,
        })
        .eq('stripe_customer_id', subscription.customer as string);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...https://corsproxy.io/?Headers, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: https://corsproxy.io/?Headers,
      status: 400,
    });
  }
});
*/
