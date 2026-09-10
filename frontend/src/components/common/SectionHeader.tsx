interface SectionHeaderProps {
  title: string
  level?: 2 | 3
}

/** Titolo di sezione uppercase condiviso — sostituisce le costanti SECTION_TITLE_STYLE duplicate per pagina. */
export function SectionHeader({ title, level = 2 }: SectionHeaderProps) {
  const Tag = `h${level}` as 'h2' | 'h3'
  return (
    <Tag
      style={{
        margin: 0,
        fontSize: level === 2 ? 14 : 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {title}
    </Tag>
  )
}
