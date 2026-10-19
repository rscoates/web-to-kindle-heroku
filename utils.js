const formatDate = (date) => {
    // We want it to be "Mon 01 Jan"
    const options = { month: 'short', day: '2-digit', weekday: "short" };
    return date.toLocaleDateString("en-GB", options);
}

module.exports = {
    formatDate,
}