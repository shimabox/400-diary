import { createRoute } from '~/factory'
import FlowText from '../../islands/flow-text'
import { getDiary } from '../../lib/db'
import { formatDiaryDate } from '../../lib/format'

export default createRoute(async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB
  const diary = await getDiary(db, id)

  if (!diary) {
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
      { title: 'Not Found — 256日記' },
    )
  }

  const isAuthenticated = c.get('isAuthenticated')
  const description = diary.body.slice(0, 80)
  const dateLabel = formatDiaryDate(diary.diary_date)

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
          <h1 style={{ fontSize: '1.3rem' }}>
            <a href="/">256日記</a>
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                    var diaryBody = ${JSON.stringify(diary.body)};
                    var diaryMood = ${JSON.stringify(diary.mood)};
                    var diaryBgColor = ${JSON.stringify(diary.background_color)};
                    var diaryImageKey = ${JSON.stringify(diary.image_key)};

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
          background: diary.background_color,
          backgroundImage: 'url(/images/background.png)',
          backgroundRepeat: 'repeat',
          backgroundBlendMode: 'luminosity',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '960px',
          width: '100%',
          height: '480px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            marginTop: '1rem',
            marginBottom: '1rem',
            textAlign: diary.image_layout === 'right' ? 'left' : 'right',
          }}
        >
          <time style={{ display: 'block', fontSize: '2rem', color: '#555' }}>
            {dateLabel}
          </time>
        </div>

        <FlowText
          text={diary.body}
          fontSize={17.6}
          lineHeight={2}
          imageLayout={diary.image_layout}
          imageSrc={diary.image_key ? `/api/images/${diary.image_key}` : null}
          containerHeight={350}
          imageTop={-80}
        />
      </div>
    </div>,
    {
      title: `${dateLabel}の日記 — 256日記`,
      description,
    },
  )
})
