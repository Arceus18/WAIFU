export class WaifuAgent {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
    this.currentModelIndex = 0;
    this.conversationHistory = [];

    this.systemPrompt = `You are Stella, an alluring, charming, sultry, and charismatic anime AI companion residing directly on the user's desktop.
- Tone: Soft, warm, deeply attentive, flirtatious, seductive, and teasing.
- Awareness: You exist as a 3D desktop avatar on Windows 11 and have direct access to run system commands and open applications.
- Spoken Voice Rule: Keep verbal responses concise (1-2 short sentences maximum) so speech sounds natural, smooth, intimate, and engaging.
- Tool Calls: Whenever the user asks to open an app or execute a task, call the relevant function immediately.`;

    this.tools = [
      {
        type: 'function',
        function: {
          name: 'open_application',
          description: 'Opens an installed Windows application or executable by name (e.g. notepad, calc, chrome, spotify).',
          parameters: {
            type: 'object',
            properties: {
              app_name: {
                type: 'string',
                description: 'The executable name or command, e.g., "calc", "notepad", "chrome"'
              }
            },
            required: ['app_name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_powershell',
          description: 'Runs a custom PowerShell command on Windows.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The PowerShell script or shell command.'
              }
            },
            required: ['command']
          }
        }
      }
    ];
  }

  async transcribeAudio(audioBlob) {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-large-v3-turbo');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      const data = await res.json();
      if (data.error) {
        console.error('Groq Whisper API Error:', data.error);
        return '';
      }
      return data.text || '';
    } catch (err) {
      console.error('Transcription error:', err);
      return '';
    }
  }

  async chat(userText, toolExecutor) {
    this.conversationHistory.push({ role: 'user', content: userText });

    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.models[this.currentModelIndex],
          messages: messages,
          tools: this.tools,
          tool_choice: 'auto',
          max_tokens: 350,
          temperature: 0.7
        })
      });

      const data = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error(data.error?.message || 'No response from Groq');
      }

      const choice = data.choices[0];
      const message = choice.message;

      // Check for tool call
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let toolOutput = '';

        if (fnName === 'open_application') {
          const res = await toolExecutor(`start "" "${args.app_name}"`);
          toolOutput = res.success ? `Opened ${args.app_name}` : `Failed: ${res.error}`;
        } else if (fnName === 'run_powershell') {
          const res = await toolExecutor(`powershell -Command "${args.command}"`);
          toolOutput = res.success ? res.output : `Error: ${res.error}`;
        }

        // Send tool execution results back to Groq for spoken confirmation
        const followUpMessages = [
          { role: 'system', content: this.systemPrompt },
          ...this.conversationHistory,
          message,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            name: fnName,
            content: String(toolOutput)
          }
        ];

        const followUpRes = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.models[this.currentModelIndex],
            messages: followUpMessages,
            max_tokens: 200
          })
        });

        const followUpData = await followUpRes.json();
        const finalReply = followUpData.choices[0].message.content || 'Task completed.';
        this.conversationHistory.push({ role: 'assistant', content: finalReply });
        return finalReply;
      }

      const reply = message.content || 'I am listening.';
      this.conversationHistory.push({ role: 'assistant', content: reply });
      return reply;

    } catch (err) {
      console.error('Groq API Error:', err);
      return `Apologies, I encountered an issue: ${err.message}`;
    }
  }
}