import { describe, expect, test } from 'vitest'
import FlowText from './flow-text'

// FlowText は island だが、公開ページ（/d/:id）では初期 HTML として SSR もされる。
// テキスト計測（@chenglou/pretext）は canvas を必要とし、Cloudflare Workers には
// canvas が無いため、計測が SSR で走ると公開ページ全体が 500 になる。
// Node にも canvas が無いので、ここで SSR して例外が出ないことを確認すれば
// Workers と同じ条件でこの回帰を検知できる。
describe('FlowText の SSR', () => {
  test('canvas の無い環境でもテキスト計測を実行せずにレンダリングできる', () => {
    const html = (
      <FlowText
        text={'あ'.repeat(400)}
        fontSize={16}
        lineHeight={2.2}
        imageLayout="left"
        imageSrc={null}
        containerHeight={400}
        dateLabel="2026年8月23日"
      />
    ).toString()

    expect(html).toContain('<div')
  })

  test('画像の寸法を渡しても SSR では配置を計算せずにレンダリングできる', () => {
    const html = (
      <FlowText
        text={'あ'.repeat(400)}
        fontSize={16}
        lineHeight={2.2}
        imageLayout="left"
        imageSrc="/api/images/diaries/abc/a.jpg"
        imageDimensions={{ width: 1200, height: 900 }}
        containerHeight={400}
      />
    ).toString()

    expect(html).toContain('/api/images/diaries/abc/a.jpg')
  })

  test('SSR では枠の大きさが決まらないので、台紙も印も出さず img は透明で待つ', () => {
    const html = (
      <FlowText
        text={'あ'.repeat(400)}
        fontSize={16}
        lineHeight={2.2}
        imageLayout="left"
        imageSrc="/api/images/diaries/abc/a.jpg"
        imageDimensions={{ width: 1200, height: 900 }}
        containerHeight={400}
      />
    ).toString()

    expect(html).toContain('class="flow-image is-transparent"')
    expect(html).not.toContain('flow-image-mat')
    expect(html).not.toContain('写真を読み込めませんでした')
    // 読み込みの結果はまだ分からないので、枠は押せるまま
    expect(html).not.toContain('disabled')
  })
})
