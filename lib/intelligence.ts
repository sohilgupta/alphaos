// lib/intelligence.ts
import { StockDetail } from './types';

export interface ThemeSuggestion {
  theme: string;
  confidence: number; // 0-100
}

const THEME_KEYWORDS: Record<string, string[]> = {
  'AI & Data Centers': ['ai', 'artificial intelligence', 'data center', 'gpu', 'server', 'networking', 'semiconductor', 'machine learning', 'deep learning', 'cloud computing'],
  'Space Exploration': ['space', 'satellite', 'orbit', 'launch', 'aerospace', 'defense', 'rocket'],
  'Robotics & Automation': ['robotics', 'automation', 'factory', 'autonomous', 'drones', 'manufacturing'],
  'Power & Grid': ['power', 'grid', 'utility', 'energy', 'electricity', 'nuclear', 'solar', 'wind', 'transmission'],
  'Cybersecurity': ['security', 'cyber', 'firewall', 'threat', 'protection', 'identity', 'zero trust'],
  'Biotech & Genomics': ['biotech', 'genomics', 'dna', 'therapeutics', 'clinical', 'pharma', 'health', 'medicine'],
  'Fintech & Payments': ['fintech', 'payment', 'crypto', 'blockchain', 'banking', 'transaction', 'financial'],
  'Electric Vehicles': ['ev', 'electric vehicle', 'battery', 'charging', 'auto', 'mobility', 'lidar']
};

export function suggestTheme(data: { name?: string; description?: string; sector?: string; industry?: string }): ThemeSuggestion | null {
  if (!data.sector && !data.industry && !data.description && !data.name) {
    return null;
  }

  const textToSearch = [
    data.name || '',
    data.sector || '',
    data.industry || '',
    data.description || ''
  ].join(' ').toLowerCase();

  let bestTheme = '';
  let maxScore = 0;

  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Create regex to match whole words or parts
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      const matches = textToSearch.match(regex);
      if (matches) {
        // Give higher weight to matches in sector/industry vs description
        const inSector = (detail.sector || '').toLowerCase().includes(kw);
        const inIndustry = (detail.industry || '').toLowerCase().includes(kw);
        
        if (inSector || inIndustry) {
          score += 30; // Strong signal
        } else {
          score += matches.length * 5; // Weak signal based on frequency in description
        }
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestTheme = theme;
    }
  }

  if (maxScore > 0) {
    // Normalize confidence
    const confidence = Math.min(100, maxScore);
    return { theme: bestTheme, confidence };
  }

  return null;
}
