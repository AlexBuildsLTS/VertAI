  import React from 'react';
  import { SafeAreaView, ViewProps, Platform, StatusBar } from 'react-native';
  import { cn } from '../../lib/utils';

  interface PageContainerProps extends ViewProps {
    children: React.ReactNode;
    className?: string;
    safeAreaTop?: boolean;
  }

  export const PageContainer: React.FC<PageContainerProps> = ({
    children,
    className,
    safeAreaTop = true,
    ...props
  }) => {
    return (
      <SafeAreaView
        className={cn('flex-1 bg-background', className)}
        style={{
          // Handle Android notch padding dynamically if needed, iOS is handled by SafeAreaView
          paddingTop:
            Platform.OS === 'android' && safeAreaTop
              ? StatusBar.currentHeight
              : 0,
        }}
        {...props}
      >
        {children}
      </SafeAreaView>
    );
  };
