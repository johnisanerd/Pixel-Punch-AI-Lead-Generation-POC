// Keep unit tests from writing into the real data/rag/ tree by default.
// Tests that exercise RAG sync should pass an explicit rag instance or set RAG_DIR + RAG_SYNC.
process.env.RAG_SYNC ??= "0";
