const Anthropic = require('@anthropic-ai/sdk');

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in .env');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function generateTemplate(useCase, category) {
  const client = getClient();
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Write a WhatsApp business message template for this use case: "${useCase}". Category: ${category}.
Use personalization variables in curly braces like {name}, {date}, {vehicle} where natural.
Keep it concise, friendly, no spam trigger words (no FREE, no CLICK NOW, no bit.ly links).
Return ONLY the message text, nothing else.`,
    }],
  });
  return msg.content[0].text.trim();
}

async function generateProductCaption(product) {
  const client = getClient();
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write a short, compelling WhatsApp caption for this product to send to customers.
Product: ${product.product_name}
Brand: ${product.brand}
Price: Rs.${product.price} (MRP Rs.${product.mrp}, ${product.discount}% off)
Description: ${product.description}
No spam trigger words. End with a clear call to action. Return ONLY the caption text.`,
    }],
  });
  return msg.content[0].text.trim();
}

module.exports = { generateTemplate, generateProductCaption };
