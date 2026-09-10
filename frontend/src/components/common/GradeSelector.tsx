import { Select } from 'antd'

interface GradeSelectorProps {
  value?: string
  onChange: (value: string | undefined) => void
  grades: string[]
  placeholder?: string
  style?: React.CSSProperties
}

export default function GradeSelector({ value, onChange, grades, placeholder = '全选', style }: GradeSelectorProps) {
  return (
    <Select
      value={value}
      onChange={onChange}
      allowClear
      placeholder={placeholder}
      style={style || { width: 120 }}
      options={grades.map(g => ({ value: g, label: `${g}级` }))}
    />
  )
}