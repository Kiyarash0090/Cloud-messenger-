import React, { useState } from 'react';
// @ts-ignore
import iranFlagEmoji from '../assets/images/iran_lion_sun_emoji.png';

// Custom waving 3D Lion and Sun flag of Iran
export const LION_AND_SUN_FLAG_URL = iranFlagEmoji;

export const getFlagUrl = (countryCode: string): string => {
  if (countryCode.toLowerCase() === 'ir') {
    return LION_AND_SUN_FLAG_URL;
  }
  return `https://flagcdn.com/${countryCode.toLowerCase()}.svg`;
};

interface EmojiImageProps {
  matchText: string;
  urls: string[];
  isFlag?: boolean;
}

const EmojiImage: React.FC<EmojiImageProps> = ({ matchText, urls, isFlag }) => {
  const [urlIndex, setUrlIndex] = useState(0);
  const [failedAll, setFailedAll] = useState(false);

  if (failedAll || !urls || urls.length === 0 || !urls[urlIndex]) {
    return <span className="inline-block align-baseline">{matchText}</span>;
  }

  return (
    <img
      src={urls[urlIndex]}
      alt={matchText}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => {
        if (urlIndex + 1 < urls.length) {
          setUrlIndex(urlIndex + 1);
        } else {
          setFailedAll(true);
        }
      }}
      className={`inline-block select-none pointer-events-none align-[-0.2em] my-0 mx-[0.05em] ${
        isFlag ? 'w-[1.3em] h-[1em] object-cover rounded-sm border border-white/10' : 'w-[1.25em] h-[1.25em] object-contain'
      }`}
    />
  );
};

/**
 * Replaces system-unrendered emoji flags and standard emojis with high-quality styled images.
 * Web-based custom emojis for premium, uniform look across all platforms.
 * If the Iran flag is detected, it renders the beautiful, historic Lion and Sun (شیر و خورشید) flag.
 */
export const parseFlags = (text: string): React.ReactNode => {
  if (!text) return text;

  // A comprehensive regex to match either regional indicators (flags) OR general emojis
  const emojiRegex = /[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|[\u{200D}\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}])*/gu;
  
  const matches = Array.from(text.matchAll(emojiRegex));
  if (matches.length === 0) return text;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;

    // 1. Add normal text before this emoji
    if (matchIndex > lastIndex) {
      elements.push(text.slice(lastIndex, matchIndex));
    }

    // 2. Render the custom emoji/flag
    const flagMatch = matchText.match(/^[\u{1F1E6}-\u{1F1FF}]{2}$/u);
    if (flagMatch) {
      const char1 = matchText.codePointAt(0);
      const char2 = matchText.codePointAt(2);
      if (char1 && char2 && char1 >= 0x1F1E6 && char1 <= 0x1F1FF && char2 >= 0x1F1E6 && char2 <= 0x1F1FF) {
        const letter1 = String.fromCharCode(char1 - 0x1F1E6 + 65);
        const letter2 = String.fromCharCode(char2 - 0x1F1E6 + 65);
        const countryCode = (letter1 + letter2).toLowerCase();
        const isIran = countryCode === 'ir';
        
        const urls = isIran 
          ? [LION_AND_SUN_FLAG_URL] 
          : [`https://cdn.jsdelivr.net/npm/emoji-datasource-google/img/google/64/${char1.toString(16).toLowerCase()}-${char2.toString(16).toLowerCase()}.png`];
        
        elements.push(
          <EmojiImage 
            key={`flag-${index}-${countryCode}`} 
            matchText={matchText} 
            urls={urls} 
            isFlag={true} 
          />
        );
      } else {
        elements.push(matchText);
      }
    } else {
      // Standard emoji or compound emoji
      const codePoints: string[] = [];
      for (const char of matchText) {
        const cp = char.codePointAt(0);
        if (cp !== undefined) {
          codePoints.push(cp.toString(16).toLowerCase());
        }
      }
      
      const fullCode = codePoints.join('-');
      const noFe0fCode = codePoints.filter(c => c !== 'fe0f').join('-');
      const isIranFlagDirect = fullCode === '1f1ee-1f1f7';

      let urls: string[] = [];
      if (isIranFlagDirect) {
        urls = [LION_AND_SUN_FLAG_URL];
      } else {
        urls.push(`https://cdn.jsdelivr.net/npm/emoji-datasource-google/img/google/64/${fullCode}.png`);
        if (fullCode !== noFe0fCode) {
          urls.push(`https://cdn.jsdelivr.net/npm/emoji-datasource-google/img/google/64/${noFe0fCode}.png`);
        }
      }

      elements.push(
        <EmojiImage 
          key={`emoji-${index}`} 
          matchText={matchText} 
          urls={urls} 
        />
      );
    }

    lastIndex = matchIndex + matchText.length;
  });

  // 3. Add remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return <>{elements}</>;
};

