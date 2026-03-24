"use strict";

const { GoogleGenAI } = require("@google/genai");

async function generateStructuredJson({
  apiKey,
  model,
  systemInstruction,
  userPrompt,
  responseSchema,
}) {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = typeof response.text === "string" ? response.text.trim() : "";
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return JSON.parse(text);
}

module.exports = {
  generateStructuredJson,
};
