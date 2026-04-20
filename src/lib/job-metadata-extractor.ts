import { logger } from './logger';
import { certificationPatterns } from './dictionaries/certifications';
import { expertiseKeywords } from './dictionaries/expertise';

/**
 * Extract metadata from job title and description using dictionary files
 */
export class JobMetadataExtractor {
  // Industry keywords
  private static readonly INDUSTRIES: Record<string, string[]> = {
    'Finance': ['finance', 'financial', 'banking', 'investment', 'trading', 'asset management', 'hedge fund', 'private equity', 'wealth management', 'CFA', 'FRM', 'treasury'],
    'Technology': ['software', 'technology', 'IT', 'tech', 'saas', 'cloud', 'developer', 'engineer', 'programming', 'devops', 'AWS', 'Azure'],
    'Healthcare': ['healthcare', 'medical', 'hospital', 'pharma', 'pharmaceutical', 'health', 'clinical', 'biotech', 'patient', 'nursing'],
    'Consulting': ['consulting', 'consultant', 'advisory', 'strategy', 'management consulting', 'advisory'],
    'Manufacturing': ['manufacturing', 'production', 'factory', 'industrial', 'supply chain', 'operations'],
    'Retail': ['retail', 'e-commerce', 'ecommerce', 'merchandising', 'sales', 'store'],
    'Real Estate': ['real estate', 'property', 'construction', 'architecture', 'commercial real estate'],
    'Energy': ['energy', 'oil', 'gas', 'renewable', 'power', 'utilities'],
    'Telecommunications': ['telecom', 'telecommunications', 'network', 'wireless'],
    'Insurance': ['insurance', 'underwriting', 'actuarial', 'claims', 'risk management'],
    'Education': ['education', 'university', 'school', 'teaching', 'academic', 'training'],
    'Government': ['government', 'public sector', 'federal', 'state', 'municipal'],
    'Nonprofit': ['nonprofit', 'non-profit', 'NGO', 'charity', 'foundation'],
    'Media': ['media', 'entertainment', 'publishing', 'journalism', 'broadcasting'],
    'Legal': ['legal', 'law', 'attorney', 'lawyer', 'paralegal', 'litigation'],
    'Accounting': [
    'accounting', 'accountant', 'accounts', 'bookkeeping', 'bookkeeper',
    'audit', 'auditor', 'tax', 'taxation', 'VAT', 'payroll', 'HMRC',
    'AAT', 'ACA', 'ACCA', 'CIMA', 'ICAEW', 'chartered accountant'],
    'Marketing': ['marketing', 'digital marketing', 'SEO', 'SEM', 'brand', 'advertising'],
    'Data Science': ['data science', 'machine learning', 'AI', 'artificial intelligence', 'data analyst', 'big data'],
  };

  // Compound seniority phrases that should be matched first (order matters: more specific first)
  // These handle cases like "Senior Associate" which should be Senior, not Entry
  private static readonly COMPOUND_SENIORITY: Array<{ pattern: RegExp; level: string }> = [
    { pattern: /\bsenior\s+associate\b/i, level: 'Senior' },
    { pattern: /\bsenior\s+analyst\b/i, level: 'Senior' },
    { pattern: /\bsenior\s+consultant\b/i, level: 'Senior' },
    { pattern: /\blead\s+associate\b/i, level: 'Senior' },
    { pattern: /\bprincipal\s+associate\b/i, level: 'Senior' },
    { pattern: /\bassociate\s+director\b/i, level: 'Management' },
    { pattern: /\bassociate\s+manager\b/i, level: 'Management' },
    { pattern: /\bsenior\s+manager\b/i, level: 'Management' },
    { pattern: /\bsenior\s+director\b/i, level: 'Management' },
    { pattern: /\bjunior\s+developer\b/i, level: 'Entry' },
    { pattern: /\bjunior\s+engineer\b/i, level: 'Entry' },
    { pattern: /\bjunior\s+analyst\b/i, level: 'Entry' },
  ];

  // Seniority levels
  private static readonly SENIORITY_KEYWORDS: Record<string, string[]> = {
    'Entry': ['entry', 'junior', 'associate', 'graduate', 'intern', 'trainee', 'assistant'],
    'Mid': ['mid', 'intermediate', 'experienced', 'professional', 'specialist'],
    'Senior': ['senior', 'lead', 'principal', 'staff', 'expert'],
    'Management': ['manager', 'director', 'head', 'chief', 'vp', 'vice president', 'ceo', 'cto', 'cfo', 'coo'],
    'Executive': ['executive', 'c-level', 'president', 'chairman', 'board'],
  };

  /**
   * Extract certificates from job title and description using dictionary
   */
  static extractCertificates(title: string, description: string): string[] {
    const text = `${title} ${description}`;
    const found = new Set<string>();

    for (const { name, pattern } of certificationPatterns) {
      if (pattern.test(text)) {
        found.add(name);
        // Reset regex lastIndex to avoid issues with global flag
        pattern.lastIndex = 0;
      }
    }

    return Array.from(found);
  }

  /**
   * Extract industry from job title, company, and description
   */
  static extractIndustry(title: string, company: string, description: string): string {
    const text = `${title} ${company} ${description}`.toLowerCase();
    const scores: Record<string, number> = {};

    // Count keyword matches for each industry
    for (const [industry, keywords] of Object.entries(this.INDUSTRIES)) {
      let score = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[+]/g, '\\+')}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length;
        }
      }
      if (score > 0) {
        scores[industry] = score;
      }
    }

    // Return industry with highest score
    if (Object.keys(scores).length === 0) {
      return 'Other';
    }

    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  /**
   * Extract seniority level from job title
   */
  static extractSeniority(title: string): string {
    // First, check for compound phrases (e.g., "Senior Associate" should be Senior, not Entry)
    for (const { pattern, level } of this.COMPOUND_SENIORITY) {
      if (pattern.test(title)) {
        return level;
      }
    }


    const titleLower = title.toLowerCase();
    const scores: Record<string, number> = {};

    // Check for seniority keywords
    for (const [level, keywords] of Object.entries(this.SENIORITY_KEYWORDS)) {
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(titleLower)) {
          scores[level] = (scores[level] || 0) + 1;
        }
      }
    }

    // Return level with highest score
    if (Object.keys(scores).length === 0) {
      return 'Mid'; // Default to Mid if no keywords found
    }

    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  /**
   * Extract keywords from job title and description using expertise dictionary
   */
  static extractKeywords(title: string, description: string): string[] {
    const text = `${title} ${description}`;
    const keywords = new Set<string>();

    // Extract expertise keywords from dictionary
    for (const [keyword, pattern] of Object.entries(expertiseKeywords)) {
      if (pattern.test(text)) {
        keywords.add(keyword);
        // Reset regex lastIndex
        pattern.lastIndex = 0;
      }
    }

    // Also extract important words from title
    const titleWords = title
      .split(/\s+/)
      .filter(word =>
        word.length > 3 &&
        !['with', 'the', 'and', 'for', 'from', 'this', 'that', 'will', 'have'].includes(word.toLowerCase())
      );

    titleWords.forEach(word => {
      const capitalized = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      if (keywords.size < 15) { // Limit total keywords
        keywords.add(capitalized);
      }
    });

    return Array.from(keywords).slice(0, 15); // Limit to top 15 keywords
  }

  /**
   * Generate a unique ID for a job based on URL
   */
  static generateJobId(url: string): string {
    // Simple hash function for URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extract all metadata from a job
   */
  static extractAllMetadata(job: {
    title: string;
    company: string;
    description: string;
    url: string;
  }) {
    const certificates = this.extractCertificates(job.title, job.description);
    const industry = this.extractIndustry(job.title, job.company, job.description);
    const seniority = this.extractSeniority(job.title);
    const keywords = this.extractKeywords(job.title, job.description);
    const id = this.generateJobId(job.url);

    return {
      id,
      certificates,
      industry,
      seniority,
      keywords,
    };
  }
}
