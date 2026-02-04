import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ExtractionResult } from '../types';

interface Props {
    url: string;
    onExtractionComplete: (result: ExtractionResult) => void;
}

export function HeadlessWebView({ url, onExtractionComplete }: Props) {
    const webViewRef = useRef<WebView>(null);

    // This script mirrors src/popup/modules/extraction_logic.js from the reference project
    // It is injected into the WebView to run in the context of the loaded page
    const INJECTED_JAVASCRIPT = `
    (function() {
        // Prevent multiple executions
        if (window.hasRunExtraction) return;
        window.hasRunExtraction = true;

        function log(msg) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
        }

        async function extract() {
            try {
                log('[WebView] Starting extraction...');
                
                // Wait for content (simple delay for Twitter/React apps)
                // In a real browser extension we might wait differently, but here we need to give JS time to render
                await new Promise(r => setTimeout(r, 3000));

                const hostname = window.location.hostname;
                log('[WebView] Hostname: ' + hostname);

                // --- TWITTER / X SUPPORT ---
                if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
                    log('[WebView] Detected Twitter/X');

                    // 1. Identify Author from URL
                    const urlParts = new URL(window.location.href).pathname.split('/');
                    const authorHandle = urlParts[1]; // /username/status/...

                    if (!authorHandle || !window.location.href.includes('/status/')) {
                         log('[WebView] Not a thread URL');
                    } else {
                        log('[WebView] Extracting Thread for: ' + authorHandle);

                        // Select tweets
                        // Try standard tweets
                        let tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
                        
                        // Try to find the main tweet if it's a "Twitter Article" (Long Post)
                        // Note: The structure for these can be different.
                        
                        let threadContent = [];
                        let title = '';
                        
                        log('[WebView] Found tweet candidates: ' + tweets.length);

                        tweets.forEach((tweet, index) => {
                            // Check author via User-Name links
                            const userLinks = tweet.querySelectorAll('div[data-testid="User-Name"] a');
                            let isAuthor = false;

                            for (const link of userLinks) {
                                const href = link.getAttribute('href');
                                if (href && href.replace('/', '').toLowerCase() === authorHandle.toLowerCase()) {
                                    isAuthor = true;
                                    break;
                                }
                            }

                            if (isAuthor) {
                                // Extract Text
                                let textEl = tweet.querySelector('[data-testid="tweetText"]');
                                let isArticle = false;

                                // Fallback for Twitter Articles (Long Posts)
                                if (!textEl) {
                                    textEl = tweet.querySelector('[data-testid="twitterArticleRichTextView"]');
                                    isArticle = !!textEl;
                                }

                                const text = textEl ? textEl.innerHTML : '';
                                
                                // Title logic
                                if (isArticle) {
                                    const articleTitleEl = tweet.querySelector('[data-testid="twitter-article-title"]');
                                    if (articleTitleEl) {
                                        title = articleTitleEl.textContent.trim();
                                    }
                                }
                                // Standard fallback
                                if (!title && textEl) {
                                    title = textEl.textContent.substring(0, 50) + '...';
                                }

                                // Helper for XML escaping
                                const escapeXml = (str) => {
                                    if (!str) return '';
                                    return str.toString()
                                        .replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;')
                                        .replace(/"/g, '&quot;')
                                        .replace(/'/g, '&apos;');
                                };

                                let tweetHtml = '<div class="tweet" style="border-bottom: 1px solid #ccc; padding: 10px 0;">';
                                if (isArticle && title) {
                                    tweetHtml += '<h2>' + escapeXml(title) + '</h2>';
                                }
                                if (text) tweetHtml += '<div>' + text + '</div>';
                                tweetHtml += '</div>';

                                threadContent.push(tweetHtml);
                            }
                        });
                        
                        log('[WebView] Thread content items: ' + threadContent.length);

                        if (threadContent.length > 0) {
                            const finalTitle = authorHandle + ' on X: "' + title.replace(/"/g, "'") + '"';
                            
                            // Date
                            let date = new Date().toISOString().split('T')[0];
                            const dateEl = document.querySelector('time');
                            if (dateEl && dateEl.getAttribute('datetime')) {
                                date = dateEl.getAttribute('datetime').split('T')[0];
                            }

                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'success',
                                article: {
                                    title: finalTitle,
                                    author: 'X (' + authorHandle + ')',
                                    date: date,
                                    wordCount: threadContent.length * 30,
                                    body: threadContent.join('\\n'),
                                    rawText: '',
                                    sourceUrl: window.location.href
                                }
                            }));
                            return;
                        }
                    }
                }

                // --- FALLBACK / STANDARD EXTRACTION ---
                // For non-Twitter or if Twitter extraction failed (e.g. strict login wall)
                // We'll return a generic error or attempt basic extraction.
                // For now, let's just return what we have or fail.
                
                log('[WebView] Fallback/Standard extraction paths not fully implemented in WebView yet.');
                window.ReactNativeWebView.postMessage(JSON.stringify({
                     type: 'error', 
                     error: 'Extraction failed or no content found via WebView'
                }));

            } catch (e) {
                log('[WebView] Error: ' + e.message);
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: e.message }));
            }
        }

        // Run after a short delay to allow hydration
        setTimeout(extract, 1500);
    })();
    true; // Note: required for some WebView versions to not crash on string return
    `;

    const DESKTOP_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    return (
        <View style={styles.container}>
            <WebView
                ref={webViewRef}
                source={{ uri: url }}
                userAgent={DESKTOP_USER_AGENT}
                injectedJavaScript={INJECTED_JAVASCRIPT}
                onMessage={(event) => {
                    try {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data.type === 'log') {
                            if (__DEV__) console.log(data.message);
                        } else if (data.type === 'success') {
                            onExtractionComplete({ success: true, article: data.article });
                        } else if (data.type === 'error') {
                            if (__DEV__) console.warn('WebView extraction error:', data.error);
                            onExtractionComplete({ success: false, error: data.error });
                        }
                    } catch (e) {
                        if (__DEV__) console.warn('Failed to parse WebView message:', e);
                    }
                }}
                onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    if (__DEV__) console.warn('WebView error: ', nativeEvent);
                    onExtractionComplete({ success: false, error: 'WebView failed to load' });
                }}
                // Hide the WebView but keep it active
                containerStyle={styles.hidden}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 0,
        width: 0,
        position: 'absolute',
        opacity: 0,
    },
    hidden: {
        width: 0,
        height: 0,
        flex: 0,
    }
});
