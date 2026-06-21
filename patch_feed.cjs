const fs = require('fs');
const file = 'b:\\agencyforte_app\\src\\pages\\Dashboard.jsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `                                    {feed.length === 0 ? (
                                      <span style={{ color: 'var(--text-muted)' }}>No recent activity detected in the last 30 days.</span>
                                    ) : (
                                      feed.map((item, idx) => (`.replace(/\r\n/g, '\n');

const replace1 = `                                    {feed.length === 0 ? (
                                      <span style={{ color: 'var(--text-muted)' }}>No recent activity detected in the last 30 days.</span>
                                    ) : (
                                      <>
                                        {feed.slice(0, 8).map((item, idx) => (`.replace(/\r\n/g, '\n');

const target2 = `                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>`.replace(/\r\n/g, '\n');

const replace2 = `                                        </div>
                                      ))}
                                      {feed.length > 8 && (
                                        <div style={{ textAlign: 'center', padding: '0.6rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', marginTop: '0.5rem', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                          + {feed.length - 8} additional events hidden to conserve space
                                        </div>
                                      )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>`.replace(/\r\n/g, '\n');

content = content.replace(/\r\n/g, '\n');

const count1 = content.split(target1).length - 1;
const count2 = content.split(target2).length - 1;

console.log('Found target1:', count1);
console.log('Found target2:', count2);

if(count1 > 0 && count2 > 0) {
    content = content.split(target1).join(replace1);
    content = content.split(target2).join(replace2);
    fs.writeFileSync(file, content);
    console.log("Patched successfully!");
} else {
    console.log("Failed to patch.");
}
