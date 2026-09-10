import LoadingSpinner from './LoadingSpinner'

interface PageLoadingProps {
  text?: string
}

export default function PageLoading({ text = '加载中...' }: PageLoadingProps) {
  return (
    <div className="page-loading">
      <LoadingSpinner size="large" text={text} />
    </div>
  )
}