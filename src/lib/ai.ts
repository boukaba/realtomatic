export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AIResponse = {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
};

export type LeaseExtraction = {
  tenantName: string;
  propertyAddress: string;
  leaseTerm: string;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  clauses: Array<{
    type: string;
    title: string;
    content: string;
    confidence: number;
  }>;
  overallConfidence: number;
};

export type PropertyAnalysis = {
  valuation: number;
  confidence: number;
  comparables: Array<{
    address: string;
    price: number;
    sqFt: number;
    pricePerSqFt: number;
  }>;
  marketTrend: string;
  recommendations: string[];
};

export type MarketReport = {
  summary: string;
  keyMetrics: Record<string, number>;
  trends: string[];
  forecast: string;
  risks: string[];
};

export type AIConfig = {
  provider: 'demo' | 'openai' | 'anthropic' | 'google';
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_MODELS: Record<AIConfig['provider'], string> = {
  demo: 'demo-model',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  const delay = 500 + Math.random() * 1000;
  return sleep(delay);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < retries - 1) {
        await sleep(RETRY_DELAY * (i + 1));
      }
    }
  }
  throw lastError;
}

function buildMessages(config: AIConfig, messages: Message[]): Message[] {
  const systemPrompt = `You are Realtomatic, an AI assistant for real estate professionals. You help with lease analysis, property valuation, market reports, and investment decisions. Always respond with valid JSON when asked to extract or analyze data.`;
  return [{ role: 'system', content: systemPrompt }, ...messages];
}

async function callOpenAI(
  config: AIConfig,
  messages: Message[]
): Promise<AIResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODELS.openai,
      messages: buildMessages(config, messages),
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `OpenAI API error: ${response.status} ${error?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};

  return {
    content,
    usage: {
      promptTokens: usage.prompt_tokens || estimateTokens(messages.map((m) => m.content).join(' ')),
      completionTokens: usage.completion_tokens || estimateTokens(content),
      totalTokens: usage.total_tokens || 0,
    },
    model: data.model || DEFAULT_MODELS.openai,
    finishReason: data.choices?.[0]?.finish_reason || 'stop',
  };
}

async function callAnthropic(
  config: AIConfig,
  messages: Message[]
): Promise<AIResponse> {
  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODELS.anthropic,
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      system: systemMessage?.content || '',
      messages: userMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Anthropic API error: ${response.status} ${error?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  const usage = data.usage || {};

  return {
    content,
    usage: {
      promptTokens: usage.input_tokens || estimateTokens(messages.map((m) => m.content).join(' ')),
      completionTokens: usage.output_tokens || estimateTokens(content),
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
    model: data.model || DEFAULT_MODELS.anthropic,
    finishReason: data.stop_reason || 'end_turn',
  };
}

async function callGoogle(
  config: AIConfig,
  messages: Message[]
): Promise<AIResponse> {
  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  const contents = userMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model || DEFAULT_MODELS.google}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: systemMessage
          ? { parts: [{ text: systemMessage.content }] }
          : undefined,
        contents,
        generationConfig: {
          temperature: config.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens ?? 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Google API error: ${response.status} ${error?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};

  return {
    content,
    usage: {
      promptTokens: usage.promptTokenCount || estimateTokens(messages.map((m) => m.content).join(' ')),
      completionTokens: usage.candidatesTokenCount || estimateTokens(content),
      totalTokens: usage.totalTokenCount || 0,
    },
    model: config.model || DEFAULT_MODELS.google,
    finishReason: data.candidates?.[0]?.finishReason || 'STOP',
  };
}

function getDemoResponse(messages: Message[]): string {
  const lastMessage = messages[messages.length - 1]?.content || '';

  if (lastMessage.toLowerCase().includes('lease') || lastMessage.toLowerCase().includes('extract')) {
    return JSON.stringify({
      tenantName: 'Acme Corporation',
      propertyAddress: '123 Main Street, Suite 400, San Francisco, CA 94105',
      leaseTerm: '36 months',
      monthlyRent: 12500,
      startDate: '2026-01-01',
      endDate: '2028-12-31',
      clauses: [
        {
          type: 'rent_escalation',
          title: 'Annual Rent Escalation',
          content: 'Base rent shall increase by 3% annually on each anniversary of the lease commencement date.',
          confidence: 0.95,
        },
        {
          type: 'termination',
          title: 'Early Termination',
          content: 'Tenant may terminate this lease after 24 months with 90 days written notice and payment of 3 months rent as penalty.',
          confidence: 0.88,
        },
        {
          type: 'maintenance',
          title: 'Maintenance Responsibilities',
          content: 'Landlord responsible for structural repairs and HVAC. Tenant responsible for interior maintenance under $500.',
          confidence: 0.92,
        },
        {
          type: 'security_deposit',
          title: 'Security Deposit',
          content: 'Tenant shall provide a security deposit equal to 2 months base rent ($25,000) upon execution.',
          confidence: 0.97,
        },
      ],
      overallConfidence: 0.93,
    });
  }

  if (lastMessage.toLowerCase().includes('property') || lastMessage.toLowerCase().includes('valuation') || lastMessage.toLowerCase().includes('analyze')) {
    return JSON.stringify({
      valuation: 2450000,
      confidence: 0.87,
      comparables: [
        { address: '456 Oak Ave, San Francisco, CA', price: 2380000, sqFt: 3200, pricePerSqFt: 744 },
        { address: '789 Pine St, San Francisco, CA', price: 2520000, sqFt: 3400, pricePerSqFt: 741 },
        { address: '321 Elm Dr, San Francisco, CA', price: 2290000, sqFt: 3100, pricePerSqFt: 739 },
      ],
      marketTrend: 'Appreciating — median prices up 4.2% YoY in this submarket',
      recommendations: [
        'Property is priced competitively relative to recent comparables',
        'Consider a 1031 exchange to defer capital gains',
        'Rental yield of 5.8% exceeds market average of 4.9%',
        'Strong tenant demand in this submarket with 96% occupancy rate',
      ],
    });
  }

  if (lastMessage.toLowerCase().includes('market') || lastMessage.toLowerCase().includes('report')) {
    return JSON.stringify({
      summary: 'The San Francisco commercial real estate market continues to show resilience with steady demand in the downtown corridor. Office vacancy rates have declined for three consecutive quarters, and rental rates are stabilizing after the pandemic-era corrections.',
      keyMetrics: {
        medianPricePerSqFt: 742,
        vacancyRate: 12.4,
        avgDaysOnMarket: 45,
        yoyPriceChange: 4.2,
        rentalYield: 5.8,
        absorptionRate: 1.2,
      },
      trends: [
        'Vacancy rates declining for 3 consecutive quarters',
        'Rental rates stabilizing after 2023 correction',
        'Increased demand for Class A office space',
        'Growing interest in mixed-use developments',
        'Cap rates compressing by 25bps in core submarkets',
      ],
      forecast: 'Market expected to continue recovery through 2026 with projected 3-5% appreciation. Interest rate cuts expected to improve transaction volume by 15-20%.',
      risks: [
        'Rising interest rates may slow investment activity',
        'Remote work trends continue to impact office demand',
        'Regulatory changes around commercial-to-residential conversions',
        'Construction costs remain elevated, limiting new supply',
      ],
    });
  }

  return JSON.stringify({
    response: "I'm Realtomatic, your AI real estate assistant. I can help you with lease analysis, property valuation, market reports, and investment decisions. What would you like to know?",
    suggestions: [
      'Extract lease data from a document',
      'Analyze a property valuation',
      'Generate a market report',
      'Compare investment opportunities',
    ],
  });
}

export async function chatCompletion(
  config: AIConfig,
  messages: Message[]
): Promise<AIResponse> {
  if (config.provider === 'demo') {
    await randomDelay();
    const content = getDemoResponse(messages);
    return {
      content,
      usage: {
        promptTokens: estimateTokens(messages.map((m) => m.content).join(' ')),
        completionTokens: estimateTokens(content),
        totalTokens: estimateTokens(messages.map((m) => m.content).join(' ')) + estimateTokens(content),
      },
      model: DEFAULT_MODELS.demo,
      finishReason: 'stop',
    };
  }

  return withRetry(async () => {
    switch (config.provider) {
      case 'openai':
        return callOpenAI(config, messages);
      case 'anthropic':
        return callAnthropic(config, messages);
      case 'google':
        return callGoogle(config, messages);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  });
}

export async function streamChatCompletion(
  config: AIConfig,
  messages: Message[],
  onChunk: (chunk: string) => void
): Promise<AIResponse> {
  if (config.provider === 'demo') {
    const fullResponse = await chatCompletion(config, messages);
    const words = fullResponse.content.split(' ');
    for (let i = 0; i < words.length; i++) {
      await sleep(30 + Math.random() * 50);
      onChunk(i === 0 ? words[i] : ` ${words[i]}`);
    }
    return fullResponse;
  }

  const model = config.model || DEFAULT_MODELS[config.provider];
  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  let response: Response;

  if (config.provider === 'openai') {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(config, messages),
        temperature: config.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 4096,
        stream: true,
      }),
    });
  } else if (config.provider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.7,
        system: systemMessage?.content || '',
        messages: userMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        stream: true,
      }),
    });
  } else {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: systemMessage
            ? { parts: [{ text: systemMessage.content }] }
            : undefined,
          contents: userMessages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: config.temperature ?? 0.7,
            maxOutputTokens: config.maxTokens ?? 4096,
          },
        }),
      }
    );
  }

  if (!response.ok) {
    throw new Error(`Streaming error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      if (config.provider === 'google') {
        try {
          const json = JSON.parse(line);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            fullContent += text;
            onChunk(text);
          }
        } catch {
          continue;
        }
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const json = JSON.parse(data);
          const text =
            config.provider === 'openai'
              ? json.choices?.[0]?.delta?.content || ''
              : json.delta?.text || '';
          if (text) {
            fullContent += text;
            onChunk(text);
          }
        } catch {
          continue;
        }
      }
    }
  }

  return {
    content: fullContent,
    usage: {
      promptTokens: estimateTokens(messages.map((m) => m.content).join(' ')),
      completionTokens: estimateTokens(fullContent),
      totalTokens: estimateTokens(messages.map((m) => m.content).join(' ')) + estimateTokens(fullContent),
    },
    model,
    finishReason: 'stop',
  };
}

export async function extractLeaseData(
  config: AIConfig,
  documentText: string
): Promise<LeaseExtraction> {
  const messages: Message[] = [
    {
      role: 'user',
      content: `Extract all lease data from the following document. Return a JSON object with tenantName, propertyAddress, leaseTerm, monthlyRent, startDate, endDate, clauses (array of {type, title, content, confidence}), and overallConfidence.\n\nDocument:\n${documentText}`,
    },
  ];

  const response = await chatCompletion(config, messages);

  try {
    return JSON.parse(response.content) as LeaseExtraction;
  } catch {
    return {
      tenantName: 'Unknown',
      propertyAddress: 'Unknown',
      leaseTerm: 'Unknown',
      monthlyRent: 0,
      startDate: '',
      endDate: '',
      clauses: [],
      overallConfidence: 0,
    };
  }
}

export async function analyzeProperty(
  config: AIConfig,
  propertyData: string
): Promise<PropertyAnalysis> {
  const messages: Message[] = [
    {
      role: 'user',
      content: `Analyze the following property data and return a JSON object with valuation, confidence, comparables (array of {address, price, sqFt, pricePerSqFt}), marketTrend, and recommendations (array of strings).\n\nProperty Data:\n${propertyData}`,
    },
  ];

  const response = await chatCompletion(config, messages);

  try {
    return JSON.parse(response.content) as PropertyAnalysis;
  } catch {
    return {
      valuation: 0,
      confidence: 0,
      comparables: [],
      marketTrend: 'Unable to analyze',
      recommendations: [],
    };
  }
}

export async function generateMarketReport(
  config: AIConfig,
  marketData: string
): Promise<MarketReport> {
  const messages: Message[] = [
    {
      role: 'user',
      content: `Generate a market report from the following data. Return a JSON object with summary, keyMetrics (record of string to number), trends (array of strings), forecast, and risks (array of strings).\n\nMarket Data:\n${marketData}`,
    },
  ];

  const response = await chatCompletion(config, messages);

  try {
    return JSON.parse(response.content) as MarketReport;
  } catch {
    return {
      summary: 'Unable to generate report',
      keyMetrics: {},
      trends: [],
      forecast: '',
      risks: [],
    };
  }
}
