import { cn } from '@/lib/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = ({ className, ...props }: CardProps) => (
  <div
    className={cn('rounded-lg border border-base-300 bg-base-100 shadow-sm', className)}
    {...props}
  />
);

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardHeader = ({ className, ...props }: CardHeaderProps) => (
  <div className={cn('border-b border-base-300 px-6 py-4', className)} {...props} />
);

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const CardTitle = ({ className, ...props }: CardTitleProps) => (
  <h2 className={cn('text-lg font-semibold text-base-900', className)} {...props} />
);

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardContent = ({ className, ...props }: CardContentProps) => (
  <div className={cn('px-6 py-4', className)} {...props} />
);

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardFooter = ({ className, ...props }: CardFooterProps) => (
  <div className={cn('border-t border-base-300 px-6 py-4', className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
