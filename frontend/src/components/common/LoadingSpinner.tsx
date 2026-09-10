interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large'
  text?: string
}

export default function LoadingSpinner({ size = 'medium', text }: LoadingSpinnerProps) {
  const sizeMap = {
    small: 24,
    medium: 40,
    large: 64
  }

  return (
    <div className="loading-spinner">
      <div 
        className="spinner"
        style={{ width: sizeMap[size], height: sizeMap[size] }}
      />
      {text && <span className="loading-text">{text}</span>}
    </div>
  )
}