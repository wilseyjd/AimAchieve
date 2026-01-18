import { GoogleGenAI, Type } from "@google/genai";
import { AIObjectiveSuggestion } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

export const generateOKRFromGoal = async (goalDescription: string): Promise<AIObjectiveSuggestion> => {
  const ai = getAIClient();
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a structured OKR (Objective, Key Results, and Actions) for the following user goal: "${goalDescription}". 
    Create 1 Objective, 2-3 Key Results, and 1-2 Actions per Key Result. 
    Ensure actions have valid frequency (daily, weekly) or are one-off.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          keyResults: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                targetValue: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                actions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      frequency: { type: Type.STRING, enum: ["daily", "weekly", "one-off"] },
                      daysOfWeek: { type: Type.ARRAY, items: { type: Type.INTEGER } } // 0-6
                    },
                    required: ["title", "frequency"]
                  }
                }
              },
              required: ["title", "targetValue", "unit", "actions"]
            }
          }
        },
        required: ["title", "keyResults"]
      }
    }
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(response.text) as AIObjectiveSuggestion;
};
