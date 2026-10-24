(function () {
  var element = document.getElementById('train-diagnostics-data');
  if (!element) return;
  var diagnostics = JSON.parse(element.textContent);
  var method = diagnostics.status === 'error' ? 'error' : 'info';
  console[method]('[Trains] ' + diagnostics.status, diagnostics);
}());
