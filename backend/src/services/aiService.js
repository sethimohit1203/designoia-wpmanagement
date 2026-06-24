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
    `Write a short, compelling WhatsApp caption for this product to send to customers.
Product: ${product.product_name}
Brand: ${product.brand}
Price: Rs.${product.price} (MRP Rs.${product.mrp}, ${product.discount}% off)
Description: ${product.description}
No spam trigger words. End with a clear call to action. Return ONLY the caption text.`
  );
  return result.response.text().trim();
}

module.exports = { generateTemplate, generateProductCaption };
