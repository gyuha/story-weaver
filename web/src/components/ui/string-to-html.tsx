interface StringToHtmlProps {
  text: React.ReactNode | string;
}

export default function StringToHtml({ text }: StringToHtmlProps) {
  if (typeof text !== 'string') {
    return <>{text}</>;
  }

  return <span>{text}</span>;
}
