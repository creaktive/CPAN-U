function (doc) {
    val = {};
    val[doc.similar] = doc.relevance;
    emit(doc.distribution, val);
}
