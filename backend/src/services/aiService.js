const { GoogleGenerativeAI } = require('@google/generative-ai');

function getModel() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set. Add a free key from https://aistudio.google.com/apikey to your environment variables.');
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

async function generateTemplate(useCase, category) {
  const model = getModel();
  const result = await model.generateContent(
    `Write a WhatsApp business message template for this use case: "${useCase}". Category: ${category}.
Use personalization variables in curly braces like {name}, {date}, {vehicle} where natural.
Keep it concise, friendly, no spam trigger words (no FREE, no CLICK NOW, no bit.ly links).
Return ONLY the message text, nothing else.`
  );
  return result.response.text().trim();
}

async function generateProductCaption(product) {
  const model = getModel();
  const result = await model.generateContent(
    `Write the BODY of a WhatsApp product listing message — NOT the title, NOT the price, NOT any contact/footer info, just the persuasive middle section.

Product: ${product.product_name}
Brand: ${product.brand || 'N/A'}
Description: ${product.description || '(none given — infer reasonable details from the product name)'}

Format exactly like this, using real inferred details where the description is sparse:
1. One short, warm opening line about the product, with 1-2 tasteful emojis.
2. A blank line.
3. 4-6 bullet lines, each starting with "✅ " covering things like Fabric/Material, Style, Fit/Sleeve, Occasion, Sizes Available (write "Please DM for size chart" if sizes aren't known) — only include bullets that make sense for this product type.

No spam trigger words (no FREE, no CLICK NOW, no bit.ly links). Do not include the product name as a heading, do not include price, do not include any "buy now" or contact instructions — those are added separately. Return ONLY this body text, nothing else.`
  );
  return result.response.text().trim();
}

module.exports = { generateTemplate, generateProductCaption };
