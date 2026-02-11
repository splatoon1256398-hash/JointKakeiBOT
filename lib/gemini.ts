import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';

// 環境変数からAPIキーを取得（クライアントサイド用）
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!apiKey) {
  console.warn('Gemini APIキーが設定されていません。.env.localファイルを確認してください。');
}

// Google Generative AIクライアントを初期化
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Geminiモデルを取得する関数
export function getGeminiModel(modelName: string = 'gemini-2.5-flash-lite') {
  if (!genAI) {
    throw new Error('Gemini APIが初期化されていません。APIキーを確認してください。');
  }
  return genAI.getGenerativeModel({ model: modelName });
}

// テキスト生成のヘルパー関数
export async function generateText(prompt: string, modelName?: string) {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// チャット機能のヘルパー関数
export async function startChat(history: Array<{ role: string; parts: Array<{ text: string }> }> = [], modelName?: string) {
  const model = getGeminiModel(modelName);
  return model.startChat({
    history,
    generationConfig: {
      maxOutputTokens: 1000,
    },
  });
}

// レシート画像解析の型定義（複数項目対応）
export interface ExpenseItem {
  categoryMain: string;      // 大カテゴリー
  categorySub: string;        // 小カテゴリー
  storeName: string;          // 店名
  amount: number;             // 金額
  memo: string;               // メモ
}

export interface ReceiptAnalysisResult {
  date: string;               // 日付
  items: ExpenseItem[];       // 支出項目の配列
  totalAmount: number;        // 合計金額
}

// 画像をBase64に変換する関数
export function fileToGenerativePart(imageData: string, mimeType: string) {
  return {
    inlineData: {
      data: imageData.split(',')[1], // Base64部分のみを取得
      mimeType,
    },
  };
}

// Supabaseからカテゴリーリストを取得してプロンプト用文字列を生成
async function generateCategoryListFromDB(): Promise<string> {
  try {
    const { data } = await supabase
      .from('categories')
      .select('main_category, subcategories')
      .order('sort_order');
    
    if (!data || data.length === 0) {
      return '- その他: その他';
    }
    
    return data.map(cat => 
      `- ${cat.main_category}: ${cat.subcategories.join(', ')}`
    ).join('\n');
  } catch (error) {
    console.error('カテゴリー取得エラー:', error);
    return '- その他: その他';
  }
}

// レシート画像を解析する関数（複数項目対応・高度化版・DB連携）
export async function analyzeReceipt(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<ReceiptAnalysisResult> {
  const model = getGeminiModel('gemini-2.5-flash-lite');
  
  const imagePart = fileToGenerativePart(imageBase64, mimeType);
  
  // DBから最新のカテゴリーリストを取得
  const categoryList = await generateCategoryListFromDB();
  
  const prompt = `このレシート画像を詳細に解析して、以下のJSON形式で情報を抽出してください：

【重要な解析ルール】
1. レシート内の商品を、カテゴリーごとにグループ化してください
2. 「値引き」や「割引」は独立した商品として扱わず、該当する商品の金額から差し引いてください
3. 各商品に適切な大カテゴリーと小カテゴリーを割り当ててください
4. 同じカテゴリーの商品は1つの項目にまとめてください
5. **必ず以下のカテゴリーリストの中から選択してください（他のカテゴリーは使用禁止）**

【税込み計算ルール（重要）】
- レシートに表示されている価格が「税抜き」の場合、以下の税率で税込みに変換してください：
  - 食品（飲食料品）→ 軽減税率 8%（税抜き価格 × 1.08）
  - その他（日用品、衣料品、サービスなど）→ 標準税率 10%（税抜き価格 × 1.10）
  - 外食・酒類 → 標準税率 10%
- レシートに「(税込)」「内税」と記載がある場合、または「合計」欄の金額が税込みの場合はそのまま使用
- 各itemの amount は**必ず税込み金額**で出力してください
- totalAmount は**レシートの支払総額**（税込）と一致させてください
- レシートに「お支払い金額」「合計」が表示されている場合、その金額を totalAmount として使用してください

【使用可能なカテゴリー一覧】
${categoryList}

【カテゴリー選択の厳密なルール】
- categoryMainは上記リストの大分類から**必ず**選択してください
- categorySubは選択した大分類に対応する小分類から**必ず**選択してください
- リストにないカテゴリーは絶対に使用しないでください
- 判断に迷う場合は「その他」カテゴリーを使用してください

【出力形式】
{
  "date": "YYYY-MM-DD",
  "items": [
    {
      "categoryMain": "食費",
      "categorySub": "食料品",
      "storeName": "店名",
      "amount": 1234,
      "memo": "野菜、肉など（税込み）"
    }
  ],
  "totalAmount": 1234
}

日付が読み取れない場合は、今日の日付（${new Date().toISOString().split('T')[0]}）を使用してください。
必ずJSON形式のみで返答してください（他の文字は含めないでください）。`;

  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    
    console.log('Gemini API Response:', text);
    
    // JSONを抽出（マークダウンのコードブロックを除去）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSONが見つかりませんでした');
    }
    
    const receiptData: ReceiptAnalysisResult = JSON.parse(jsonMatch[0]);
    
    // データの検証と補正
    if (!receiptData.items || receiptData.items.length === 0) {
      throw new Error('項目が見つかりませんでした');
    }
    
    return receiptData;
  } catch (error) {
    console.error('レシート解析エラー:', error);
    // エラー時はデフォルト値を返す（1項目のみ）
    return {
      date: new Date().toISOString().split('T')[0],
      items: [
        {
          categoryMain: '食費',
          categorySub: '食料品',
          storeName: '不明',
          amount: 0,
          memo: '手動で入力してください',
        }
      ],
      totalAmount: 0,
    };
  }
}

export { genAI };
