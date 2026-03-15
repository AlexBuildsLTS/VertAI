import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { cn } from '../../lib/utils';

interface ButtonProps {
  onPress: () => void;
  title?: string; // Optional because you might use children/icons
  isLoading?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary';
  children?: React.ReactNode; // FIXED: Added this so your video screen stops erroring
}

export const Button = ({
  onPress,
  title,
  isLoading,
  className,
  variant = 'primary',
  children,
}: ButtonProps) => {
  const baseClass =
    'flex-row items-center justify-center rounded-xl px-6 py-4 border';
  const variants = {
    primary: 'bg-[#00F0FF]/10 border-[#00F0FF]',
    secondary: 'bg-[#1A1A24] border-[#ffffff14]',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isLoading}
      className={cn(baseClass, variants[variant], className)}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#00F0FF' : '#FFF'} />
      ) : (
        <>
          {children}
          {title && (
            <Text
              className={cn(
                'text-base font-bold',
                children ? 'ml-2' : '',
                variant === 'primary' ? 'text-[#00F0FF]' : 'text-white',
              )}
            >
              {title}
            </Text>
          )}
        </>
      )}
    </TouchableOpacity>
  );
};
