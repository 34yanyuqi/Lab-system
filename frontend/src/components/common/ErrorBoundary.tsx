import { Component, ErrorInfo, ReactNode } from 'react'
import { Alert, Button } from 'antd'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-content">
            <Alert
              message="页面出错了"
              description="抱歉，页面加载时出现了错误"
              type="error"
              showIcon
            />
            <div className="error-actions">
              <Button type="primary" onClick={this.handleRetry}>
                重试
              </Button>
              <Button onClick={this.handleGoHome}>
                返回首页
              </Button>
            </div>
            {this.state.error && (
              <details className="error-details">
                <summary>错误详情</summary>
                <pre>{this.state.error.stack}</pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary