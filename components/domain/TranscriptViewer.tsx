import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { formatTranscriptTime } from '../../utils/formatters/time';

export const TranscriptViewer = ({
  transcriptJson,
}: {
  transcriptJson: any;
}) => {
  const [showRaw, setShowRaw] = useState(false);

  // Attempt to safely extract the words array
  const words = useMemo(() => {
    if (!transcriptJson) return [];

    let parsed = transcriptJson;
    if (typeof transcriptJson === 'string') {
      try {
        parsed = JSON.parse(transcriptJson);
      } catch (e) {
        return [];
      }
    }

    // Target 1: Deepgram Nova-2 Standard Format
    if (parsed?.results?.channels?.[0]?.alternatives?.[0]?.words) {
      return parsed.results.channels[0].alternatives[0].words;
    }
    // Target 2: Flat Array
    if (Array.isArray(parsed)) return parsed;
    // Target 3: Generic 'words' wrapper
    if (parsed?.words && Array.isArray(parsed.words)) return parsed.words;
    // Target 4: OpenAI Whisper raw text fallback
    if (parsed?.text) return [{ start: 0, word: parsed.text, speaker: 0 }];

    return [];
  }, [transcriptJson]);

  // DIAGNOSTIC EMPTY STATE
  if (words.length === 0) {
    return (
      <View className="p-8 border border-neon-pink/30 rounded-3xl bg-neon-pink/[0.02]">
        <Text className="text-neon-pink font-black text-[10px] tracking-[4px] uppercase mb-4 text-center">
          Payload_Empty_or_Unrecognized
        </Text>
        <Text className="text-center text-xs text-white/60 leading-relaxed mb-6">
          The UI queried the database, but the transcript payload is either
          missing or formatted incorrectly by the Edge Function.
        </Text>

        <TouchableOpacity
          onPress={() => setShowRaw(!showRaw)}
          className="py-4 px-6 border border-white/10 rounded-xl bg-white/5 self-center"
        >
          <Text className="text-white text-[10px] font-bold uppercase tracking-widest">
            {showRaw
              ? 'Hide Raw Database Payload'
              : 'View Raw Database Payload'}
          </Text>
        </TouchableOpacity>

        {showRaw && (
          <ScrollView className="mt-6 max-h-96 w-full p-4 bg-[#05050A] rounded-xl border border-white/10">
            <Text className="font-mono text-[10px] text-neon-cyan leading-5">
              {transcriptJson === undefined
                ? "UNDEFINED (Row missing from 'transcripts' table)"
                : transcriptJson === null
                  ? 'NULL (Column exists, but data is empty)'
                  : JSON.stringify(transcriptJson, null, 2)}
            </Text>
          </ScrollView>
        )}
      </View>
    );
  }

  // Normal semantic grouping logic
  const groupedTranscript = useMemo(() => {
    const groups: Array<{ speaker: number; text: string; startTime: number }> =
      [];
    if (words.length === 0) return groups;

    let currentGroup = {
      speaker: words[0].speaker || 0,
      text: '',
      startTime: words[0].start || 0,
    };

    words.forEach((wordObj: any, index: number) => {
      const isNewSpeaker = wordObj.speaker !== currentGroup.speaker;
      const isLongPause =
        index > 0 && wordObj.start - words[index - 1].end > 1.5;
      const wordText = wordObj.word || wordObj.punctuated_word || '';

      if (isNewSpeaker || isLongPause) {
        groups.push({ ...currentGroup, text: currentGroup.text.trim() });
        currentGroup = {
          speaker: wordObj.speaker || 0,
          text: wordText,
          startTime: wordObj.start || 0,
        };
      } else {
        currentGroup.text += ` ${wordText}`;
      }
    });

    groups.push({ ...currentGroup, text: currentGroup.text.trim() });
    return groups;
  }, [words]);

  return (
    <ScrollView className="flex-1 w-full" showsVerticalScrollIndicator={false}>
      <View className="flex-col gap-6 pb-12">
        {groupedTranscript.map((group, index) => (
          <View
            key={index}
            className="flex-row items-start gap-4 pl-4 border-l-2 border-white/10"
          >
            <View className="px-2 py-1 border rounded bg-white/[0.02] border-white/10">
              <Text className="font-mono text-xs font-bold text-neon-cyan">
                {formatTranscriptTime(group.startTime)}
              </Text>
            </View>
            <View className="flex-1 pt-1">
              <Text className="mb-1 text-[9px] font-black tracking-widest uppercase text-white/30">
                Chapter {group.speaker}
              </Text>
              <Text className="text-sm leading-6 text-white/90">
                {group.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};
