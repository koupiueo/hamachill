import React from 'react';
import { t } from '../../i18n';

// メッセージ1件の描画で例外が出ても、画面全体が真っ白にならないようにする
export default class MessageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[Message] render error:', this.props.messageId, error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // 内容が更新されたらもう一度描画を試す
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-1 pl-[72px] text-[12px] text-zinc-400 italic select-none">
          {t('message.renderError')}
        </div>
      );
    }
    return this.props.children;
  }
}
