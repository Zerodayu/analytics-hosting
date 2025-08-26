import axios from 'axios';

export async function generateContent(prompt, content) {
  const data = JSON.stringify({
    "prompt": prompt,
    "content": content,
    "expected_output": [
      {
        "title": "input a title here",
        "description": "input description here"
      }
    ]
  });

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://ai-tools.rev21labs.com/api/v1/ai/prompt',
    headers: { 
      'Content-Type': 'application/json', 
      'x-api-key': 'YjJkNmQzMTktYTE1Ny00MjdlLTk4N2EtNDMwZDJhYjY3MTQw'
    },
    data: data
  };

  try {
    const response = await axios.request(config);
    return response.data;
  } catch (error) {
    console.error('Error calling AI service:', error);
    throw error;
  }
}

// Example usage:
// import { generateContent } from './api/aiService.js';
// 
// async function test() {
//   try {
//     const result = await generateContent("this is a test", "create a 10 random titles with description");
//     console.log(JSON.stringify(result));
//   } catch (error) {
//     console.error(error);
//   }
// }
// test();