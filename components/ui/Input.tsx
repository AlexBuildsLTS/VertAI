import React from 'react';
import { TextInput, TextInputProps, View, Text } from 'react-native';
import { cn } from '../../lib/utils';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <View className="w-full mb-4">
        {label && (
          <Text className="text-text-secondary mb-2 text-sm font-medium">
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor="#A1A1AA"
          className={cn(
            'w-full rounded-xl border border-cardBorder bg-card/50 px-4 py-4 text-black backdrop-blur-md focus:border-neon-cyan/50 focus:bg-card/80 transition-all',
            error && 'border-neon-pink/50 focus:border-neon-pink',
            className,
          )}
          {...props}
        />
        {error && <Text className="text-neon-pink text-xs mt-1">{error}</Text>}
      </View>
    );
  },
);
Input.displayName = 'Input';
