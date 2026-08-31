function toText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(toText).join('');
  if (value && typeof value === 'object') return toText(value.text ?? value.content ?? value.value);
  return '';
}

export function extractApiText(provider, payload) {
  if (provider === 'anthropic') return (payload?.content || []).map((item) => item?.type === 'text' ? toText(item.text) : '').join('');
  if (provider === 'gemini') return (payload?.candidates?.[0]?.content?.parts || []).map((part) => toText(part.text)).join('');
  return toText(payload?.choices?.[0]?.message?.content) || toText(payload?.choices?.[0]?.text) || toText(payload?.output_text);
}

export function extractReasoning(provider, payload) {
  if (provider === 'anthropic') return (payload?.content || []).map((item) => item?.type === 'thinking' ? toText(item.thinking) : '').join('');
  if (provider === 'gemini') return (payload?.candidates?.[0]?.content?.parts || []).map((part) => part?.thought ? toText(part.text) : '').join('');
  const choice = payload?.choices?.[0] || {};
  return toText(choice?.message?.reasoning_content) || toText(choice?.message?.reasoning) || toText(choice?.delta?.reasoning_content) || toText(choice?.delta?.reasoning);
}

export async function readSseResponse(response, provider) {
  if (!response.body?.getReader) throw new Error('当前浏览器不支持流式响应读取');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = ''; let text = ''; let reasoning = ''; const chunks = [];
  const consume = (block) => {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data); chunks.push(parsed);
        const delta = extractStreamDelta(provider, parsed);
        text += delta.text; reasoning += delta.reasoning;
      } catch { /* Ignore provider keep-alives and malformed ancillary events. */ }
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || '';
    blocks.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return { text: text.trim(), reasoning: reasoning.trim(), raw: { streamed: true, chunks } };
}

function extractStreamDelta(provider, data) {
  if (provider === 'anthropic') {
    const delta = data?.delta || {};
    return { text: delta.type === 'text_delta' ? toText(delta.text) : '', reasoning: delta.type === 'thinking_delta' ? toText(delta.thinking) : '' };
  }
  const delta = data?.choices?.[0]?.delta || {};
  return { text: toText(delta.content), reasoning: toText(delta.reasoning_content) || toText(delta.reasoning) };
}
