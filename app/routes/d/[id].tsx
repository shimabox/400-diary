import { createRoute } from '~/factory'
import FlowText from '../../islands/flow-text'
import MoodMarker from '../../islands/mood-marker'
import { getDiaryWithSnapshot } from '../../lib/db'
import { formatDiaryDate } from '../../lib/format'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || '400字日記'
  const id = c.req.param('id')!
  const db = c.env.DB
  const result = await getDiaryWithSnapshot(db, id)

  if (!result) {
    return c.render(
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '3rem 1rem',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
          日記が見つかりません
        </p>
        <a
          href="/"
          style={{
            padding: '0.4rem 1rem',
            border: '1px solid #333',
            borderRadius: '4px',
            fontSize: '0.9rem',
          }}
        >
          一覧に戻る
        </a>
      </div>,
      { title: `Not Found — ${appName}` },
    )
  }

  const isAuthenticated = c.get('isAuthenticated')
  const { snapshot, ...diary } = result
  const pubBody = snapshot.body
  const pubImageKey = snapshot.image_key
  const pubImageLayout = snapshot.image_layout as 'left' | 'right'
  const pubImageX = snapshot.image_x
  const pubImageY = snapshot.image_y
  const pubBgColor = snapshot.background_color
  const pubMood = snapshot.mood
  const description = pubBody.slice(0, 80)
  const dateLabel = formatDiaryDate(diary.diary_date)
  // スナップショット ID をクエリに載せることで、再公開時に og:image URL 自体が
  // 変わり、ブラウザや SNS のキャッシュが自動で迂回される。
  const ogImageUrl = `/api/og/${diary.id}?v=${snapshot.id}`

  return c.render(
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 0.5rem 1rem',
          }}
        >
          <h1
            style={{
              fontSize: '1.3rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <a href="/">{appName}</a>
            <MoodMarker moodKey={pubMood} />
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  id="export-md-btn"
                  style={{
                    padding: '0.3rem 0.8rem',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  MDエクスポート
                </button>
                <script
                  dangerouslySetInnerHTML={{
                    __html: `
                      document.getElementById('export-md-btn').addEventListener('click', function() {
                        var diaryDate = ${JSON.stringify(diary.diary_date)};
                        var diaryBody = ${JSON.stringify(pubBody)};
                        var diaryMood = ${JSON.stringify(pubMood)};
                        var diaryBgColor = ${JSON.stringify(pubBgColor)};
                        var diaryImageKey = ${JSON.stringify(pubImageKey)};

                        var lines = ['---'];
                        lines.push('date: ' + diaryDate);
                        if (diaryMood) lines.push('mood: ' + diaryMood);
                        lines.push('background_color: "' + diaryBgColor + '"');
                        lines.push('---');

                        var md = lines.join('\\n') + '\\n\\n';
                        md += diaryBody;

                        if (diaryImageKey) {
                          md += '\\n\\n![日記の写真](/api/images/' + diaryImageKey + ')';
                        }

                        var blob = new Blob([md], { type: 'text/markdown' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = diaryDate + '.md';
                        a.click();
                        URL.revokeObjectURL(url);
                      });
                    `,
                  }}
                />
              </>
            )}
            {isAuthenticated && (
              <a
                href={ogImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.3rem 0.8rem',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                OGP確認
              </a>
            )}
            {isAuthenticated && (
              <a
                href={`/edit/${diary.id}`}
                style={{
                  padding: '0.3rem 0.8rem',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                編集する
              </a>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          background: pubBgColor,
          backgroundImage: 'url(/images/background.webp)',
          backgroundRepeat: 'repeat',
          backgroundBlendMode: 'luminosity',
          borderRadius: '12px',
          padding: '2rem 2.6rem',
          maxWidth: '960px',
          width: '100%',
          height: '480px',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
        id="diary-scroll"
        class="hide-scrollbar"
      >
        <div style={{ minWidth: '880px' }}>
          <FlowText
            text={pubBody}
            fontSize={17.6}
            lineHeight={2}
            imageLayout={pubImageLayout}
            imageSrc={pubImageKey ? `/api/images/${pubImageKey}` : null}
            containerHeight={416}
            dateLabel={dateLabel}
            imagePosition={
              pubImageX != null && pubImageY != null
                ? { x: pubImageX, y: pubImageY }
                : null
            }
          />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          requestAnimationFrame(function() {
            var el = document.getElementById('diary-scroll');
            if (el) el.scrollLeft = el.scrollWidth;
          });
        `,
          }}
        />
      </div>
    </div>,
    {
      title: `${dateLabel}の日記 — ${appName}`,
      description,
      ogImage: ogImageUrl,
      preloadImage: pubImageKey ? `/api/images/${pubImageKey}` : undefined,
    },
  )
})
