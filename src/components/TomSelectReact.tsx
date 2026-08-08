import React, { useEffect, useRef } from 'react';
import TomSelect from 'tom-select';

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: { value: string | number; text: string }[];
}

export default function TomSelectReact({ children, options, ...props }: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const tsInstance = useRef<any>(null);

  useEffect(() => {
    if (selectRef.current && !tsInstance.current) {
      tsInstance.current = new TomSelect(selectRef.current, {
        create: false,
        sortField: [{ field: "text", direction: "asc" }]
      });
    }

    return () => {
      if (tsInstance.current) {
        tsInstance.current.destroy();
        tsInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (tsInstance.current && props.value !== undefined) {
      tsInstance.current.setValue(props.value as string, true);
    }
  }, [props.value]);

  useEffect(() => {
    if (tsInstance.current) {
      tsInstance.current.sync();
    }
  }, [children]);

  return (
    <select ref={selectRef} {...props}>
      {children}
    </select>
  );
}
